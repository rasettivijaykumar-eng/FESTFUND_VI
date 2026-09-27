import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Festival } from "../lib/api";
import { useAuth } from "../context/AppState";

type Scope = {
  festId: string;
  setFestId: (value: string) => void;
  festivals: Festival[];
  current?: Festival;
  loading: boolean;
};

const FestivalScopeContext = createContext<Scope | null>(null);

export function FestivalScopeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const festivals = useQuery({
    queryKey: ["my-festivals"],
    enabled: user?.role === "ADMIN",
    queryFn: async () => (await api.get("/festivals")).data.data as Festival[],
  });
  const [festId, setFestIdState] = useState(localStorage.getItem("festfund.fest") || "");
  useEffect(() => {
    if (user?.role === "COMMITTEE" && user.festId) setFestIdState(user.festId);
    else if (!festId && festivals.data?.[0]) setFestIdState(festivals.data[0].festId);
  }, [user, festivals.data, festId]);
  const setFestId = (value: string) => {
    setFestIdState(value);
    localStorage.setItem("festfund.fest", value);
  };
  const value = useMemo<Scope>(() => ({
    festId,
    setFestId,
    festivals: festivals.data || [],
    current: festivals.data?.find((f) => f.festId === festId),
    loading: festivals.isLoading,
  }), [festId, festivals.data, festivals.isLoading]);
  return <FestivalScopeContext.Provider value={value}>{children}</FestivalScopeContext.Provider>;
}

export function useFestivalScope() {
  const ctx = useContext(FestivalScopeContext);
  if (!ctx) throw new Error("Festival scope missing");
  return ctx;
}
