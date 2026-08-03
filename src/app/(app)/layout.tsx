import { BottomNav, TopBar } from "@/components/nav";
import { Providers } from "@/components/providers";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <Providers>
      <div className="mx-auto min-h-dvh w-full max-w-lg">
        <TopBar name={session.user.name} role={session.user.role} />
        <main className="px-4 pb-28 pt-5">{children}</main>
        <BottomNav role={session.user.role} />
      </div>
    </Providers>
  );
}
