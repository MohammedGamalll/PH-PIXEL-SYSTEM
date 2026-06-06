import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useEmployees } from "@/hooks/use-employees";
import {
  useAdminMessages, useCreateAdminMessage, useDeleteAdminMessage,
} from "@/hooks/use-admin-messages";
import { Send, Trash2, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/hr/messages")({
  component: AdminMessagesPage,
});

function AdminMessagesPage() {
  const { dir, lang } = useI18n();
  const isAr = lang === "ar";
  const { data: empData } = useEmployees();
  const employees = empData?.rows ?? [];
  const { data: messages = [] } = useAdminMessages();
  const create = useCreateAdminMessage();
  const remove = useDeleteAdminMessage();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState<string>(""); // "" = all

  const send = () => {
    if (!title.trim()) return;
    create.mutate(
      { title: title.trim(), body: body.trim() || null, target_employee_id: target || null },
      {
        onSuccess: () => {
          setTitle("");
          setBody("");
          setTarget("");
        },
      }
    );
  };

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={isAr ? "رسائل للموظفين" : "Employee messages"} />

      <DataCard className="border-gray-300">
        <h2 className="text-sm font-bold mb-3">{isAr ? "إرسال رسالة جديدة" : "Send new message"}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label className="text-xs">{isAr ? "العنوان" : "Title"} *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </div>
          <div>
            <Label className="text-xs">{isAr ? "الموظف المستهدف" : "Target employee"}</Label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full h-9 rounded border border-gray-300 px-2 text-sm bg-white"
            >
              <option value="">{isAr ? "جميع الموظفين" : "All employees"}</option>
              {employees.map((e: any) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">{isAr ? "نص الرسالة" : "Body"}</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={2000} />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={send}
            disabled={!title.trim() || create.isPending}
            className="h-9 px-4 inline-flex items-center gap-2 text-sm rounded text-white disabled:opacity-50"
            style={{ backgroundColor: "#166534" }}
          >
            <Send className="h-4 w-4" /> {isAr ? "إرسال" : "Send"}
          </button>
        </div>
      </DataCard>

      <DataCard className="border-gray-300">
        <h2 className="text-sm font-bold mb-3">
          {isAr ? "الرسائل المرسلة" : "Sent messages"} ({messages.length})
        </h2>
        <div className="space-y-2">
          {messages.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-6">
              {isAr ? "لا توجد رسائل" : "No messages"}
            </div>
          ) : (
            messages.map((m) => {
              const emp = employees.find((e: any) => e.id === m.target_employee_id);
              return (
                <div key={m.id} className="border border-gray-200 rounded p-3 bg-white">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                        <Users className="h-3 w-3" />
                        <span>{emp ? emp.name : (isAr ? "جميع الموظفين" : "All employees")}</span>
                        <span>•</span>
                        <span>{new Date(m.created_at).toLocaleString(isAr ? "ar-EG" : "en-GB")}</span>
                      </div>
                      <div className="text-sm font-bold">{m.title}</div>
                      {m.body && <div className="text-xs mt-1 whitespace-pre-wrap text-gray-700">{m.body}</div>}
                    </div>
                    <button
                      onClick={() => remove.mutate(m.id)}
                      className="h-7 px-2 inline-flex items-center gap-1 text-xs rounded text-white shrink-0"
                      style={{ backgroundColor: "#ef4444" }}
                    >
                      <Trash2 className="h-3 w-3" /> {isAr ? "حذف" : "Delete"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DataCard>
    </div>
  );
}
