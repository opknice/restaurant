'use strict'

const { createServer } = require('node:http')
const { readFileSync, existsSync } = require('node:fs')
const { join } = require('node:path')
const { spawn } = require('node:child_process')

const bridgeRoot = join(__dirname, '..')

function loadEnv(filePath) {
  if (!existsSync(filePath)) return
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)=(.*)$/)
    if (!match || process.env[match[1]]) continue
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
}

loadEnv(join(bridgeRoot, '.env.local'))

const config = {
  bridgeId: process.env.PRINT_BRIDGE_ID ?? 'counter-pc-01',
  fontName: process.env.PRINT_FONT_NAME ?? 'Leelawadee UI',
  pollIntervalMs: Number(process.env.PRINT_POLL_INTERVAL_MS ?? 2000),
  printerName: process.env.PRINT_PRINTER_NAME ?? '',
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  statusPort: Number(process.env.PRINT_STATUS_PORT ?? 4318),
  supabaseUrl: (process.env.SUPABASE_URL ?? '').replace(/\/$/, ''),
}

function assertConfig() {
  const missing = Object.entries({
    PRINT_PRINTER_NAME: config.printerName,
    SUPABASE_SERVICE_ROLE_KEY: config.serviceRoleKey,
    SUPABASE_URL: config.supabaseUrl,
  }).filter(([, value]) => !value).map(([name]) => name)
  if (missing.length > 0) throw new Error(`ตั้งค่าไม่ครบ: ${missing.join(', ')}`)
  if (!Number.isFinite(config.pollIntervalMs) || config.pollIntervalMs < 500) {
    throw new Error('PRINT_POLL_INTERVAL_MS ต้องไม่น้อยกว่า 500')
  }
}

async function callRpc(functionName, body) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const message = (await response.text()).slice(0, 500)
    throw new Error(`Supabase RPC ${functionName} ล้มเหลว (${response.status}): ${message}`)
  }
  return response.json()
}

function numeric(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function money(value) {
  return numeric(value).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function thaiDateTime(value) {
  const date = new Date(String(value ?? ''))
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
}

function buildPrintModel(receipt) {
  const payload = receipt.payload ?? {}
  const payment = payload.payment ?? {}
  const store = payload.store ?? {}
  const table = payload.table ?? {}
  const isField = receipt.mode === 'field'
  const items = Array.isArray(payload.items) ? payload.items.map((item) => ({
    Name: String(item.name ?? ''),
    Quantity: String(item.quantity ?? 0),
    UnitPrice: money(item.unit_price),
    LineTotal: money(item.line_total),
  })) : []

  return {
    Mode: receipt.mode,
    HeaderLines: isField
      ? [`โต๊ะ ${table.name ?? '-'}`, `บิล #${payload.order_number ?? '-'}`]
      : [String(store.store_name ?? 'ร้านอาหาร'), String(store.phone ?? ''), `บิล #${payload.order_number ?? '-'}  โต๊ะ ${table.name ?? '-'}`, thaiDateTime(payload.closed_at)],
    Items: items,
    IsField: isField,
    FooterLines: isField ? [] : [
      `ยอดอาหาร                         ${money(payload.subtotal)}`,
      numeric(payload.discount) > 0 ? `ส่วนลด                            -${money(payload.discount)}` : '',
      `รวมสุทธิ                         ${money(payload.total)}`,
      payment.method === 'cash' ? `เงินสด รับ ${money(payment.received_amount)} ทอน ${money(payment.change_amount)}` : `เงินโอน${payment.transfer_reference ? ` (${payment.transfer_reference})` : ''}`,
      String(store.receipt_footer ?? ''),
    ].filter(Boolean),
  }
}

function runPowerShellPrint(receipt) {
  const printModel = buildPrintModel(receipt)
  const payloadBase64 = Buffer.from(JSON.stringify(printModel), 'utf8').toString('base64')
  const scriptPath = join(__dirname, 'print-receipt.ps1')
  const executable = process.platform === 'win32' ? 'powershell.exe' : 'powershell'
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-PrinterName', config.printerName, '-FontName', config.fontName, '-PayloadBase64', payloadBase64]

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Windows print command failed (${code}): ${stderr.slice(0, 500)}`))
    })
  })
}

let isBusy = false
let lastError = null
let lastPrintedAt = null

async function processQueue() {
  if (isBusy) return
  isBusy = true
  try {
    const receipt = await callRpc('bridge_claim_next_receipt', { p_bridge_id: config.bridgeId })
    if (!receipt) return
    try {
      await runPowerShellPrint(receipt)
      await callRpc('bridge_complete_receipt_print', { p_receipt_id: receipt.id, p_success: true, p_error: null })
      lastPrintedAt = new Date().toISOString()
      lastError = null
      console.log(`[${lastPrintedAt}] printed receipt ${receipt.id}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ไม่สามารถพิมพ์ได้'
      lastError = message
      await callRpc('bridge_complete_receipt_print', { p_receipt_id: receipt.id, p_success: false, p_error: message })
      console.error(`[${new Date().toISOString()}] print failed: ${message}`)
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'print bridge error'
    console.error(`[${new Date().toISOString()}] ${lastError}`)
  } finally {
    isBusy = false
  }
}

function startStatusServer() {
  const server = createServer((request, response) => {
    if (request.url !== '/health') {
      response.writeHead(404)
      response.end()
      return
    }
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    response.end(JSON.stringify({ bridgeId: config.bridgeId, busy: isBusy, lastError, lastPrintedAt, printerConfigured: Boolean(config.printerName) }))
  })
  server.listen(config.statusPort, '127.0.0.1', () => console.log(`status: http://127.0.0.1:${config.statusPort}/health`))
}

assertConfig()
console.log(`Print bridge started: ${config.bridgeId}; printer: ${config.printerName}`)
startStatusServer()
void processQueue()
setInterval(() => { void processQueue() }, config.pollIntervalMs)
