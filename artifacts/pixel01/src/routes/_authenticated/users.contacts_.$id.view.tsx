import { createFileRoute } from "@tanstack/react-router";
import { ContactViewPage } from "@/components/contacts/ContactViewPage";

export const Route = createFileRoute("/_authenticated/users/contacts_/$id/view")({
  component: () => {
    const { id } = Route.useParams();
    return <ContactViewPage contactId={id} />;
  },
});
