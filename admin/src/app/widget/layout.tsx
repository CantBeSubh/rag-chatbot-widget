export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Hide the root layout's admin header and reset body background for iframe transparency */}
      <style>{`
        body > header { display: none !important; }
        body { background: transparent !important; margin: 0; }
      `}</style>
      {children}
    </>
  )
}
