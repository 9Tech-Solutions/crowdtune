export default function App() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 gap-4">
      <h1 className="text-4xl font-semibold">CrowdTune</h1>
      <p className="text-zinc-400">Phase 0 skeleton. No features yet.</p>
      <a
        href="/auth/sign-in"
        className="px-4 py-2 rounded-lg bg-zinc-100 text-zinc-950 font-medium hover:bg-zinc-300 transition"
      >
        Sign in
      </a>
    </main>
  )
}
