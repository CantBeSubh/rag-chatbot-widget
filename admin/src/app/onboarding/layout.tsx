import { redirect } from "next/navigation"

import { auth } from "@clerk/nextjs/server"

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const key = (await auth()).sessionClaims?.metadata.apikey

  if (!!key === true) {
    redirect("/")
  }

  return <>{children}</>
}
