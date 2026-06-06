import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CountForm } from "@/components/inventory-count/CountForm";
import { z } from "zod";

const searchSchema = z.object({ print: z.string().optional(), edit: z.string().optional() });

export const Route = createFileRoute("/_authenticated/inventory-count/edit/$id")({
  component: EditPage,
  validateSearch: (s) => searchSchema.parse(s),
});

function EditPage() {
  const { id } = Route.useParams();
  const { print, edit } = Route.useSearch();
  const { data, isLoading, error } = useQuery({
    queryKey: ["stock_adjustment", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_adjustments" as any)
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  if (isLoading) return <div className="p-6 text-gray-500">...</div>;
  if (error || !data) return <div className="p-6 text-red-600">{(error as any)?.message || "Not found"}</div>;

  // edit=1 forces edit mode even on approved records
  const readOnly = edit === "1" ? false : data.status === "approved";

  return (
    <CountForm
      existingId={id}
      initial={data}
      readOnly={readOnly}
      autoPrint={print === "1"}
    />
  );
}
