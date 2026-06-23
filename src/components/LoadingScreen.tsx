// 로딩 화면 컴포넌트

export default function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-purple-light via-white to-pink-light">
      <div className="flex flex-col items-center gap-4">
        <div className="text-5xl animate-bounce">☁️</div>
        <p className="text-purple-dark font-bold text-lg">올락</p>
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-purple-soft animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
