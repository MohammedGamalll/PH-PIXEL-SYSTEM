import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useExpenseCategories, useCreateExpenseCategory } from "@/hooks/use-expense-categories";
import { useI18n } from "@/lib/i18n";

export function AddExpenseCategoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t, dir } = useI18n();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [isSub, setIsSub] = useState(false);
  const [parentId, setParentId] = useState<string>("");

  const { data: cats = [] } = useExpenseCategories();
  const create = useCreateExpenseCategory();

  const parents = (cats as any[]).filter((c) => !c.parent_id);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await create.mutateAsync({
      name: name.trim(),
      code: code.trim() || null,
      parent_id: isSub && parentId ? parentId : null,
    });
    setName(""); setCode(""); setIsSub(false); setParentId("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={dir}>
        <DialogHeader>
          <DialogTitle className="text-start">{t("expenses.category.title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label className="block text-start mb-1">{t("expenses.category.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("expenses.category.name_ph")} required />
          </div>
          <div>
            <Label className="block text-start mb-1">{t("expenses.category.code")}</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("expenses.category.code_ph")} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={isSub} onCheckedChange={(v) => setIsSub(!!v)} />
            <span className="text-sm">{t("expenses.category.add_as_sub")}</span>
          </label>
          {isSub && (
            <div>
              <Label className="block text-start mb-1">{t("expenses.category.parent")}</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger><SelectValue placeholder={t("expenses.category.parent_ph")} /></SelectTrigger>
                <SelectContent>
                  {parents.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex gap-2 justify-start">
            <Button type="submit" disabled={create.isPending}>{t("expenses.actions.save")}</Button>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>{t("expenses.actions.close")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
