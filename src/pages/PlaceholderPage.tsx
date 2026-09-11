interface PlaceholderPageProps {
  readonly title: string
  readonly description: string
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <section className="content-card" aria-labelledby="page-title">
      <p className="eyebrow">Phase 1</p>
      <h2 id="page-title">{title}</h2>
      <p>{description}</p>
    </section>
  )
}
