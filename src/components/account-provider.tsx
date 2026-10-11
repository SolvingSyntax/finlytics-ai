import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// No sign-in: watchlist, alerts and theme are saved on the visitor's device.
export type Profile = {
  display_name: string | null;
  theme: string | null;
  watchlist: string[];
  alerts: Record<string, unknown>;
};
type Account = {
  user: { id: string } | null;
  profile: Profile | null;
  save: (patch: Partial<Profile>) => Promise<void>;
};
const KEY = "finlytics-ai:preferences";
const AccountContext = createContext<Account | null>(null);
export function useAccount() {
  const a = useContext(AccountContext);
  if (!a) throw new Error("Account provider missing");
  return a;
}

function readLocal(): Profile {
  let s: Partial<Profile> = {};
  try { s = JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { /* ignore */ }
  return {
    display_name: null,
    theme: s.theme ?? localStorage.getItem("mp-theme"),
    watchlist: Array.isArray(s.watchlist) ? s.watchlist : [],
    alerts: s.alerts && typeof s.alerts === "object" ? s.alerts : {},
  };
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => { setProfile(readLocal()); }, []);

  async function save(patch: Partial<Profile>) {
    setProfile((old) => {
      const next = { ...readLocal(), ...old, ...patch };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  return (
    <AccountContext.Provider value={{ user: null, profile, save }}>
      {children}
    </AccountContext.Provider>
  );
}
