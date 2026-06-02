export default function TestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: "#CBCFDA",
      }}
    >
      <style>{`
        html, body {
          background-color: #CBCFDA !important;
        }
      `}</style>
      {children}
    </div>
  );
}
