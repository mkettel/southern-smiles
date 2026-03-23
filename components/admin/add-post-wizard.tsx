"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { createPostWithStats, createDivision } from "@/actions/admin";
import type { Division, Profile } from "@/lib/types";
import { Plus, Trash2, Check, ChevronRight, ChevronLeft, Pencil } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface AddPostWizardProps {
  divisions: Division[];
  employees: Profile[];
  trigger: React.ReactNode;
}

interface StatDraft {
  id: string;
  name: string;
  abbreviation: string;
  stat_type: "dollar" | "percentage" | "count";
  good_direction: "up" | "down";
}

const STEPS = [
  { number: 1, label: "Post" },
  { number: 2, label: "Stats" },
  { number: 3, label: "Assign" },
  { number: 4, label: "Review" },
];

const TYPE_LABELS = { dollar: "Dollar ($)", percentage: "Percentage (%)", count: "Count (#)" };
const DIR_LABELS = { up: "Higher is better", down: "Lower is better" };

export function AddPostWizard({ divisions, employees, trigger }: AddPostWizardProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [isPending, startTransition] = useTransition();

  // Step 1
  const [postTitle, setPostTitle] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [creatingDivision, setCreatingDivision] = useState(false);
  const [newDivName, setNewDivName] = useState("");
  const [newDivNumber, setNewDivNumber] = useState("");
  const [localDivisions, setLocalDivisions] = useState(divisions);
  const [savingDiv, setSavingDiv] = useState(false);

  // Step 2
  const [stats, setStats] = useState<StatDraft[]>([]);
  const [newStatName, setNewStatName] = useState("");
  const [newStatAbbr, setNewStatAbbr] = useState("");
  const [newStatType, setNewStatType] = useState<"dollar" | "percentage" | "count">("count");
  const [newStatDir, setNewStatDir] = useState<"up" | "down">("up");

  // Step 3
  const [employeeId, setEmployeeId] = useState("");

  // Step 4 editing
  const [editingStep, setEditingStep] = useState<number | null>(null);

  function reset() {
    setStep(1);
    setPostTitle("");
    setDivisionId("");
    setCreatingDivision(false);
    setNewDivName("");
    setNewDivNumber("");
    setLocalDivisions(divisions);
    setStats([]);
    setNewStatName("");
    setNewStatAbbr("");
    setNewStatType("count");
    setNewStatDir("up");
    setEmployeeId("");
    setEditingStep(null);
  }

  function addStat() {
    if (!newStatName.trim()) {
      toast.error("Stat name is required");
      return;
    }
    const duplicate = stats.some(
      (s) => s.name.toLowerCase() === newStatName.trim().toLowerCase()
    );
    if (duplicate) {
      toast.error("A stat with that name already exists");
      return;
    }
    setStats((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: newStatName.trim(),
        abbreviation: newStatAbbr.trim(),
        stat_type: newStatType,
        good_direction: newStatDir,
      },
    ]);
    setNewStatName("");
    setNewStatAbbr("");
    setNewStatType("count");
    setNewStatDir("up");
  }

  function removeStat(id: string) {
    setStats((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleCreateDivision() {
    const num = parseInt(newDivNumber);
    if (!newDivName.trim() || isNaN(num) || num < 1) {
      toast.error("Division name and a valid number are required");
      return;
    }

    setSavingDiv(true);
    const result = await createDivision({ number: num, name: newDivName.trim() });

    if (result.error) {
      toast.error(typeof result.error === "string" ? result.error : "Failed to create division");
      setSavingDiv(false);
      return;
    }

    // Refetch divisions to get the new one with its ID
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data: updatedDivs } = await supabase
      .from("divisions")
      .select("*")
      .order("number");

    if (updatedDivs) {
      setLocalDivisions(updatedDivs as Division[]);
      // Auto-select the newly created division
      const newDiv = updatedDivs.find(
        (d: Division) => d.number === num && d.name === newDivName.trim()
      );
      if (newDiv) setDivisionId(newDiv.id);
    }

    setCreatingDivision(false);
    setNewDivName("");
    setNewDivNumber("");
    setSavingDiv(false);
    toast.success("Division created");
  }

  function canProceed(): boolean {
    switch (step) {
      case 1: return !!postTitle.trim() && !!divisionId;
      case 2: return stats.length > 0;
      case 3: return true; // employee is optional
      case 4: return true;
      default: return false;
    }
  }

  function handleSubmit() {
    startTransition(async () => {
      const result = await createPostWithStats({
        postTitle: postTitle.trim(),
        divisionId,
        stats: stats.map((s) => ({
          name: s.name,
          abbreviation: s.abbreviation || undefined,
          stat_type: s.stat_type,
          good_direction: s.good_direction,
        })),
        employeeId: employeeId || undefined,
      });

      if (result.error) {
        toast.error(typeof result.error === "string" ? result.error : "Creation failed");
      } else {
        toast.success("Post created successfully!");
        setOpen(false);
        reset();
      }
    });
  }

  const selectedDivision = localDivisions.find((d) => d.id === divisionId);
  const selectedEmployee = employees.find((e) => e.id === employeeId);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger onClick={() => setOpen(true)}>
        {trigger}
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Post</DialogTitle>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-1 py-2">
            {STEPS.map((s, i) => (
              <div key={s.number} className="flex items-center">
                <button
                  onClick={() => {
                    if (s.number < step) setStep(s.number);
                  }}
                  disabled={s.number > step}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    s.number === step
                      ? "bg-primary text-primary-foreground"
                      : s.number < step
                        ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 cursor-pointer"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {s.number < step ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <span>{s.number}</span>
                  )}
                  {s.label}
                </button>
                {i < STEPS.length - 1 && (
                  <ChevronRight className="h-3 w-3 text-muted-foreground mx-0.5" />
                )}
              </div>
            ))}
          </div>

          {/* Step content */}
          <div className="py-2 min-h-[200px]">
            {/* Step 1: Post name + division */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Post Title</Label>
                  <Input
                    value={postTitle}
                    onChange={(e) => setPostTitle(e.target.value)}
                    placeholder="e.g., New Patient Scheduling Coordinator"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Division</Label>
                  {!creatingDivision ? (
                    <>
                      <Select
                        value={divisionId || "_none"}
                        onValueChange={(v) => v && v !== "_none" && setDivisionId(v)}
                      >
                        <SelectTrigger>
                          <span>
                            {selectedDivision
                              ? `Div ${selectedDivision.number} – ${selectedDivision.name}`
                              : "Select division..."}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {localDivisions.map((div) => (
                            <SelectItem key={div.id} value={div.id}>
                              Div {div.number} – {div.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <button
                        onClick={() => setCreatingDivision(true)}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                        Create new division
                      </button>
                    </>
                  ) : (
                    <div className="rounded-md border p-3 space-y-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        New Division
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Number</Label>
                          <Input
                            type="number"
                            min="1"
                            value={newDivNumber}
                            onChange={(e) => setNewDivNumber(e.target.value)}
                            placeholder="e.g., 5"
                            className="text-sm"
                          />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <Label className="text-xs">Name</Label>
                          <Input
                            value={newDivName}
                            onChange={(e) => setNewDivName(e.target.value)}
                            placeholder="e.g., Qualifications"
                            className="text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={handleCreateDivision}
                          disabled={savingDiv || !newDivName.trim() || !newDivNumber}
                        >
                          {savingDiv ? "Creating..." : "Create Division"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setCreatingDivision(false);
                            setNewDivName("");
                            setNewDivNumber("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 2: Add stats */}
            {step === 2 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  What stats should <strong>{postTitle}</strong> report?
                </p>

                {stats.length > 0 && (
                  <div className="space-y-2">
                    {stats.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between rounded-md border px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{s.name}</span>
                          {s.abbreviation && (
                            <span className="text-xs text-muted-foreground">({s.abbreviation})</span>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {TYPE_LABELS[s.stat_type]}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {DIR_LABELS[s.good_direction]}
                          </Badge>
                        </div>
                        <button
                          onClick={() => removeStat(s.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="rounded-md border p-3 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Add a stat
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Name</Label>
                      <Input
                        value={newStatName}
                        onChange={(e) => setNewStatName(e.target.value)}
                        placeholder="e.g., Conversion Rate"
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Abbreviation</Label>
                      <Input
                        value={newStatAbbr}
                        onChange={(e) => setNewStatAbbr(e.target.value)}
                        placeholder="e.g., Conv"
                        maxLength={10}
                        className="text-sm"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Type</Label>
                      <Select
                        value={newStatType}
                        onValueChange={(v) => v && setNewStatType(v as typeof newStatType)}
                      >
                        <SelectTrigger className="text-sm">
                          <span>{TYPE_LABELS[newStatType]}</span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dollar">Dollar ($)</SelectItem>
                          <SelectItem value="percentage">Percentage (%)</SelectItem>
                          <SelectItem value="count">Count (#)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Good Direction</Label>
                      <Select
                        value={newStatDir}
                        onValueChange={(v) => v && setNewStatDir(v as typeof newStatDir)}
                      >
                        <SelectTrigger className="text-sm">
                          <span>{DIR_LABELS[newStatDir]}</span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="up">Higher is better</SelectItem>
                          <SelectItem value="down">Lower is better</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addStat}
                    disabled={!newStatName.trim()}
                    className="w-full"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Stat
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Assign employee */}
            {step === 3 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Who should be assigned to <strong>{postTitle}</strong>? You can skip this and assign later.
                </p>
                <div className="space-y-2">
                  <Label>Employee</Label>
                  <Select
                    value={employeeId || "_none"}
                    onValueChange={(v) => setEmployeeId(v === "_none" ? "" : v ?? "")}
                  >
                    <SelectTrigger>
                      <span>
                        {selectedEmployee
                          ? selectedEmployee.full_name
                          : "Skip — assign later"}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Skip — assign later</SelectItem>
                      {employees
                        .filter((e) => e.is_active)
                        .map((emp) => (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.full_name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Step 4: Review */}
            {step === 4 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground mb-3">
                  Review everything before creating.
                </p>

                <div className="rounded-md border divide-y">
                  {/* Post */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Post</p>
                      <p className="font-medium">{postTitle}</p>
                    </div>
                    <button
                      onClick={() => setStep(1)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Division */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Division</p>
                      <p className="font-medium">
                        {selectedDivision
                          ? `Div ${selectedDivision.number} – ${selectedDivision.name}`
                          : "—"}
                      </p>
                    </div>
                    <button
                      onClick={() => setStep(1)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Stats */}
                  <div className="flex items-start justify-between px-4 py-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">
                        Stats ({stats.length})
                      </p>
                      <div className="space-y-1">
                        {stats.map((s) => (
                          <div key={s.id} className="flex items-center gap-2">
                            <span className="text-sm font-medium">{s.name}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {TYPE_LABELS[s.stat_type]}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px]">
                              {DIR_LABELS[s.good_direction]}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => setStep(2)}
                      className="text-muted-foreground hover:text-foreground transition-colors mt-1"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Employee */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Assigned To</p>
                      <p className="font-medium">
                        {selectedEmployee?.full_name ?? "Not assigned yet"}
                      </p>
                    </div>
                    <button
                      onClick={() => setStep(3)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer navigation */}
          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <div>
              {step > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep(step - 1)}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              )}
            </div>
            <div>
              {step < 4 ? (
                <Button
                  size="sm"
                  onClick={() => setStep(step + 1)}
                  disabled={!canProceed()}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={isPending}
                >
                  {isPending ? "Creating..." : (
                    <>
                      <Check className="h-4 w-4 mr-1" />
                      Create Post
                    </>
                  )}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
