import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useWarehouses, type Warehouse } from "@/hooks/use-warehouses";

// Lock warehouse switching: all operations use the main stock context.
const LOCK_TO_DEFAULT = true;

type WarehouseContextValue = {
  warehouses: Warehouse[];
  currentWarehouseId: string | null;
  setCurrentWarehouseId: (id: string | null) => void;
  currentWarehouse: Warehouse | null;
  isLoading: boolean;
};

const Ctx = createContext<WarehouseContextValue | undefined>(undefined);

const STORAGE_KEY = "current_warehouse_id";

export function WarehouseProvider({ children }: { children: ReactNode }) {
  const { data: warehouses = [], isLoading } = useWarehouses();

  // Multi-warehouse state (still declared so hook order is stable when
  // toggling LOCK_TO_DEFAULT, but ignored while locked).
  const [storedId, setStoredId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(STORAGE_KEY);
  });

  useEffect(() => {
    if (LOCK_TO_DEFAULT) return;
    if (!warehouses.length) return;
    if (storedId && warehouses.some((w) => w.id === storedId)) return;
    const def = warehouses.find((w) => w.is_default) ?? warehouses[0];
    setStoredId(def.id);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, def.id);
  }, [warehouses, storedId]);

  if (LOCK_TO_DEFAULT) {
    return (
      <Ctx.Provider
        value={{
          warehouses,
          currentWarehouseId: null,
          setCurrentWarehouseId: () => {
            /* locked: switching disabled */
          },
          currentWarehouse: null,
          isLoading,
        }}
      >
        {children}
      </Ctx.Provider>
    );
  }

  const setCurrentWarehouseId = (id: string | null) => {
    setStoredId(id);
    if (typeof window !== "undefined") {
      if (id) window.localStorage.setItem(STORAGE_KEY, id);
      else window.localStorage.removeItem(STORAGE_KEY);
    }
  };

  const currentWarehouse = warehouses.find((w) => w.id === storedId) ?? null;

  return (
    <Ctx.Provider
      value={{
        warehouses,
        currentWarehouseId: storedId,
        setCurrentWarehouseId,
        currentWarehouse,
        isLoading,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useWarehouseContext() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWarehouseContext must be used within WarehouseProvider");
  return ctx;
}
