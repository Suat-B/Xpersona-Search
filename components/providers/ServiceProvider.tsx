"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Service } from "@/lib/subdomain";

const ServiceContext = createContext<Service>("hub");

export function ServiceProvider({
  service,
  children,
}: {
  service: Service;
  children: ReactNode;
}) {
  return (
    <ServiceContext.Provider value={service}>{children}</ServiceContext.Provider>
  );
}

export function useService(): Service {
  return useContext(ServiceContext);
}
