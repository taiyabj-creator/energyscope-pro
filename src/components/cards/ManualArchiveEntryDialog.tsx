import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useManualArchiveEntry } from "@/hooks/useSolarData";
import { formatDate } from "@/utils/format";
import { cn } from "@/lib/utils";

const MAX_MANUAL_KWH = 100;

function istDateString(instant = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

type Step = "form" | "confirm";

interface ManualArchiveEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManualArchiveEntryDialog({ open, onOpenChange }: ManualArchiveEntryDialogProps) {
  const mutation = useManualArchiveEntry();

  const maxDate = useMemo(() => istDateString(), []);
  const [step, setStep] = useState<Step>("form");
  const [date, setDate] = useState(maxDate);
  const [kwh, setKwh] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep("form");
      setDate(istDateString());
      setKwh("");
      setPassword("");
      setError(null);
    }
  }, [open]);

  const close = () => {
    if (mutation.isPending) return;
    setStep("form");
    setPassword("");
    setError(null);
    onOpenChange(false);
  };

  const validate = (): string | null => {
    if (!isValidCalendarDate(date)) return "Enter a valid date (YYYY-MM-DD).";
    if (date > istDateString()) return "Date cannot be in the future.";
    const value = Number(kwh);
    if (!Number.isFinite(value) || value <= 0 || value > MAX_MANUAL_KWH) {
      return `Generation must be greater than 0 and at most ${MAX_MANUAL_KWH} kWh.`;
    }
    if (password.length === 0) return "Enter the archive master password.";
    return null;
  };

  const handleSave = () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStep("confirm");
  };

  const handleConfirm = () => {
    setError(null);
    mutation.mutate(
      { generationDate: date, generationKwh: Number(kwh), masterPassword: password },
      {
        onSuccess: (result) => {
          toast.success("Archive value saved", {
            description: `${formatDate(result.generationDate)} · ${result.generationKwh.toFixed(2)} kWh · Manual Override`,
          });
          onOpenChange(false);
          setStep("form");
          setPassword("");
        },
        onError: () => {
          setStep("form");
          setError("Could not save the archive value. Check the master password and try again.");
        },
      },
    );
  };

  const kwhNumber = Number(kwh);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" />
            {step === "confirm" ? "Confirm manual entry" : "Manual Archive Entry"}
          </DialogTitle>
          <DialogDescription>
            Set the archived generation for a single day. This overwrites the stored value and is
            protected by the archive master password.
          </DialogDescription>
        </DialogHeader>

        {step === "form" ? (
          <div className="grid gap-4 py-1">
            <div className="grid gap-2">
              <Label htmlFor="mae-date">Date</Label>
              <Input
                id="mae-date"
                type="date"
                value={date}
                max={maxDate}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="mae-kwh">Generation (kWh)</Label>
              <Input
                id="mae-kwh"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                max={MAX_MANUAL_KWH}
                placeholder="e.g. 12.50"
                value={kwh}
                onChange={(e) => setKwh(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="mae-password">Archive master password</Label>
              <Input
                id="mae-password"
                type="password"
                autoComplete="new-password"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5" /> Used only to authorize this save — never
                stored.
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        ) : (
          <div className="grid gap-4 py-1">
            <div className="rounded-lg border border-border bg-surface-2/60 p-4">
              <p className="text-sm">
                You are about to replace the archived generation for{" "}
                <span className="font-semibold text-foreground">{formatDate(date)}</span> with{" "}
                <span className="font-semibold text-foreground">
                  {Number.isFinite(kwhNumber) ? kwhNumber.toFixed(2) : "—"} kWh
                </span>
                .
              </p>
            </div>
            <p className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
              <AlertTriangle className="size-3.5 shrink-0" />
              The previous archive value will be overwritten, and the automatic collector will not
              modify this day afterwards.
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          {step === "form" ? (
            <>
              <Button variant="ghost" onClick={close} disabled={mutation.isPending}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={mutation.isPending}>
                Save &amp; review
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep("form")} disabled={mutation.isPending}>
                Back
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={mutation.isPending}
                className={cn(mutation.isPending && "opacity-80")}
              >
                {mutation.isPending ? "Saving…" : "Confirm & Save"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
