param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath,
  [string]$DatabasePath = (Join-Path $PSScriptRoot '..\\..\\ProgramRestaurant\\RestaurantDatabase.mdb')
)

$resolvedDatabasePath = (Resolve-Path -LiteralPath $DatabasePath).Path
$connection = New-Object System.Data.OleDb.OleDbConnection "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$resolvedDatabasePath;Mode=Read;"

try {
  $connection.Open()
  $command = $connection.CreateCommand()
  $command.CommandText = @'
SELECT ID, Product_Group, Product_Name, Product_Price
FROM stock_products
ORDER BY Product_Group, Product_Name, ID
'@

  $table = New-Object System.Data.DataTable
  $table.Load($command.ExecuteReader())

  $table | ForEach-Object {
    [pscustomobject]@{
      source_id = $_.ID
      category = $_.Product_Group
      name = $_.Product_Name
      price = $_.Product_Price
      import_status = 'review_required'
    }
  } | Export-Csv -LiteralPath $OutputPath -NoTypeInformation -Encoding utf8
}
finally {
  $connection.Dispose()
}
