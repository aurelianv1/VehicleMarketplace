// Înlocuitor temporar pentru paginile care încă nu sunt construite
export default function ComingSoon({ title }: { title: string }) {
  return (
    <div className="py-10">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-slate-600">Pagina este în lucru.</p>
    </div>
  )
}
