import { useEffect, useState } from "react";
import {
  CalendarRange,
  Download,
  FileSpreadsheet,
  FileText,
  FileType,
  Loader2,
} from "lucide-react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EXPORT_FORMATS,
  EXPORT_SCOPES,
  describeExportPeriod,
  downloadProductionExport,
  exportErrorMessage,
  validateExportSelection,
  type ExportFormat,
  type ExportScope,
  type ExportSelection,
} from "@/services/exportService";
import { istTodayKey } from "@/utils/currentDayGeneration";
import { cn } from "@/lib/utils";

const MONTHS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 9 }, (_, index) => String(CURRENT_YEAR + 1 - index));

const FORMAT_ICONS: Record<ExportFormat, typeof Download> = {
  csv: FileText,
  xlsx: FileSpreadsheet,
  pdf: FileType,
};

const FORMAT_PENDING_LABEL: Record<ExportFormat, string> = {
  csv: "Generating CSV…",
  xlsx: "Generating Excel…",
  pdf: "Generating PDF…",
};

type Step = "scope" | "format";

export interface ProductionExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selected scope, so a caller can open the dialog already narrowed down. */
  initialScope?: ExportScope;
  /** Pre-selected format, highlighted on the format step. */
  initialFormat?: ExportFormat;
}

/**
 * Defaults are derived from the plant's Asia/Kolkata "today" (istTodayKey) so
 * the picker never defaults to yesterday in the first hours of an IST day, and
 * every value is carried as a plain date string.
 */
function defaultSelection(): ExportSelection {
  const today = istTodayKey();
  const monthStart = `${today.slice(0, 7)}-01`;

  return {
    scope: "month",
    date: today,
    from: monthStart,
    to: today,
    month: today.slice(0, 7),
    year: today.slice(0, 4),
  };
}

export function ProductionExportDialog({
  open,
  onOpenChange,
  initialScope,
  initialFormat,
}: ProductionExportDialogProps) {
  const [step, setStep] = useState<Step>("scope");
  const [selection, setSelection] = useState<ExportSelection>(defaultSelection);
  const [format, setFormat] = useState<ExportFormat>(initialFormat ?? "csv");
  const [pending, setPending] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setStep("scope");
    setSelection({ ...defaultSelection(), ...(initialScope ? { scope: initialScope } : {}) });
    setFormat(initialFormat ?? "csv");
    setPending(null);
    setError(null);
  }, [open, initialScope, initialFormat]);

  const patch = (next: Partial<ExportSelection>) => {
    setSelection((current) => ({ ...current, ...next }));
    setError(null);
  };

  const period = describeExportPeriod(selection);
  const busy = pending !== null;

  const close = () => {
    if (busy) return;
    setError(null);
    onOpenChange(false);
  };

  const handleContinue = () => {
    const problem = validateExportSelection(selection);
    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    setStep("format");
  };

  const handleDownload = async () => {
    // Re-validate at download time: the selection is the contract with the
    // server, and the dialog may have been sat on for a while.
    const problem = validateExportSelection(selection);
    if (problem) {
      setError(problem);
      setStep("scope");
      return;
    }

    setError(null);
    setPending(format);

    try {
      await downloadProductionExport(selection, format);
      setPending(null);
      // Only close once the file has actually been produced.
      onOpenChange(false);
    } catch (err) {
      setPending(null);
      setError(exportErrorMessage(err));
    }
  };

  const scopeOptions = EXPORT_SCOPES;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="size-4 text-muted-foreground" />
            {step === "format" ? "Choose format" : "Export Production Data"}
          </DialogTitle>
          <DialogDescription>
            {step === "format"
              ? "Confirm what is being exported, then pick a file format."
              : "Select the production data you want to export."}
          </DialogDescription>
        </DialogHeader>

        {step === "scope" ? (
          <div className="grid gap-4 py-1">
            <div className="grid gap-2">
              <Label>Select data to export</Label>
              <RadioGroup
                value={selection.scope}
                onValueChange={(value) => patch({ scope: value as ExportScope })}
                className="gap-2"
              >
                {scopeOptions.map((option) => (
                  <div key={option.key} className="flex items-start gap-2.5">
                    <RadioGroupItem value={option.key} id={`export-scope-${option.key}`} />
                    <Label
                      htmlFor={`export-scope-${option.key}`}
                      className="cursor-pointer leading-tight font-normal"
                    >
                      {option.label}
                      <span className="block text-xs text-muted-foreground">{option.hint}</span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {selection.scope === "date" && (
              <div className="grid gap-2">
                <Label htmlFor="export-date">Date</Label>
                <Input
                  id="export-date"
                  type="date"
                  value={selection.date}
                  onChange={(event) => patch({ date: event.target.value })}
                />
              </div>
            )}

            {selection.scope === "range" && (
              <div className="grid gap-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="export-from">From</Label>
                    <Input
                      id="export-from"
                      type="date"
                      value={selection.from}
                      onChange={(event) => patch({ from: event.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="export-to">To</Label>
                    <Input
                      id="export-to"
                      type="date"
                      value={selection.to}
                      onChange={(event) => patch({ to: event.target.value })}
                    />
                  </div>
                </div>
                {selection.from > selection.to && (
                  <p className="text-xs text-destructive">
                    The start date must not be after the end date.
                  </p>
                )}
              </div>
            )}

            {selection.scope === "month" && (
              <div className="grid gap-2">
                <Label htmlFor="export-month">Month</Label>
                <div className="grid grid-cols-[1fr_110px] gap-3">
                  <Select
                    value={selection.month.slice(5, 7)}
                    onValueChange={(value) =>
                      patch({ month: `${selection.month.slice(0, 4)}-${value}` })
                    }
                  >
                    <SelectTrigger id="export-month">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((month) => (
                        <SelectItem key={month.value} value={month.value}>
                          {month.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={selection.year} onValueChange={(value) => patch({ year: value })}>
                    <SelectTrigger id="export-year" aria-label="Year">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {YEAR_OPTIONS.map((year) => (
                        <SelectItem key={year} value={year}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {selection.scope === "year" && (
              <div className="grid gap-2">
                <Label htmlFor="export-year-only">Year</Label>
                <Select value={selection.year} onValueChange={(value) => patch({ year: value })}>
                  <SelectTrigger id="export-year-only">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {YEAR_OPTIONS.map((year) => (
                      <SelectItem key={year} value={year}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-1 rounded-lg border border-border bg-surface-2/60 p-3">
              <p className="text-xs text-muted-foreground">Data source</p>
              <p className="text-sm">UTL Production Data</p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        ) : (
          <div className="grid gap-4 py-1">
            <div className="rounded-lg border border-border bg-surface-2/60 p-4">
              <p className="text-sm font-semibold text-foreground">{period?.label ?? "—"}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {period
                  ? `${period.expectedDays} day${period.expectedDays === 1 ? "" : "s"} selected`
                  : "—"}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Includes every day in the selected period. Days without a UTL record are marked as
                &ldquo;No record&rdquo; rather than zero.
              </p>
            </div>

            <div className="grid gap-2">
              <Label>Choose format</Label>
              <div className="grid gap-2">
                {EXPORT_FORMATS.map((option) => {
                  const Icon = FORMAT_ICONS[option.key];

                  return (
                    <button
                      key={option.key}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setFormat(option.key);
                        setError(null);
                      }}
                      className={cn(
                        "flex items-center justify-between rounded-2xl border p-3 text-left transition",
                        format === option.key
                          ? "border-solar/50 bg-solar/10"
                          : "border-border/70 bg-muted/20 hover:bg-muted/40",
                        busy && "opacity-60",
                      )}
                    >
                      <span className="text-sm font-medium">{option.label}</span>
                      <Icon className="size-4 text-solar" />
                    </button>
                  );
                })}
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          {step === "scope" ? (
            <>
              <Button variant="ghost" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={handleContinue} disabled={busy}>
                Continue
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setStep("scope");
                  setError(null);
                }}
                disabled={busy}
              >
                Back
              </Button>
              <Button onClick={handleDownload} disabled={busy} className={cn(busy && "opacity-80")}>
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {FORMAT_PENDING_LABEL[pending!]}
                  </>
                ) : (
                  <>
                    <CalendarRange className="size-4" />
                    Download
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
