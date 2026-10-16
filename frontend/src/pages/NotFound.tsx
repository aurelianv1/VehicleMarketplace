import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="mt-2 text-slate-600">Pagina nu există.</p>
      <Link to="/" className="mt-6 inline-block font-medium text-blue-600 hover:underline">
        Înapoi la anunțuri
      </Link>
    </div>
  )
}
