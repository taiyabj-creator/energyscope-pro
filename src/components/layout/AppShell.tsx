import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouterState } from "@tanstack/react-router";
import { Header } from "@/components/layout/Header";
import { SidebarNav, navItems } from "@/components/layout/SidebarNav";
import { usePlantInfo } from "@/hooks/useSolarData";
import { AiChatWidget } from "@/components/chat/AiChatWidget";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: plant } = usePlantInfo();
  const capacity = plant?.capacityKw;

  const title =
    navItems.find((i) => i.to === pathname)?.label ??
    (pathname === "/profile" ? "Profile" : "UTL Solar Dashboard");
  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="relative min-h-screen">
      <div className="halo pointer-events-none fixed inset-x-0 top-0 h-[420px]" aria-hidden />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden shrink-0 border-r border-border/60 bg-surface-2/70 backdrop-blur-xl transition-[width] duration-300 lg:block",
          collapsed ? "w-[84px]" : "w-[264px]",
        )}
      >
        <SidebarNav
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          capacityKw={capacity}
        />
      </aside>

      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
              className="fixed inset-y-0 left-0 z-50 w-[264px] border-r border-border/60 bg-card lg:hidden"
            >
              <SidebarNav
                collapsed={false}
                capacityKw={capacity}
                onNavigate={() => setDrawerOpen(false)}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div
        className={cn(
          "transition-[padding] duration-300",
          collapsed ? "lg:pl-[84px]" : "lg:pl-[264px]",
        )}
      >
        <Header title={title} onOpenSidebar={() => setDrawerOpen(true)} />
        <main className="w-full max-w-[1600px] mx-auto px-4 pb-16 pt-6 sm:px-6 lg:pt-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <AiChatWidget />
    </div>
  );
}
