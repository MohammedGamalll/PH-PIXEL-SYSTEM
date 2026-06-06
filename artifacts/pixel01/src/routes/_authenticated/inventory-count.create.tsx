import { createFileRoute } from "@tanstack/react-router";
import { CountForm } from "@/components/inventory-count/CountForm";

export const Route = createFileRoute("/_authenticated/inventory-count/create")({
  component: CreatePage,
});

function CreatePage() {
  return <CountForm />;
}
