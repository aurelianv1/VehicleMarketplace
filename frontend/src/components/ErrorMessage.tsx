export default function ErrorMessage({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </div>
  )
}
