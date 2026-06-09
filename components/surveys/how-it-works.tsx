"use client";

import { useState } from "react";
import {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  HelpCircle,
  Users,
  FilePlus2,
  QrCode,
  Send,
  BarChart3,
} from "lucide-react";

const STEPS = [
  {
    icon: Users,
    title: "1 · Import your patients",
    body: "Upload a CSV of the patient list (name, optional phone/email). Patients are saved permanently, so insights about a person build up across every mailing.",
  },
  {
    icon: FilePlus2,
    title: "2 · Create a campaign",
    body: "A campaign is one mailing. Write the questions you want and set the $50 appreciation credit. You can use different questions for every mailing.",
  },
  {
    icon: QrCode,
    title: "3 · Enroll & print",
    body: "“Enroll all patients” mints a unique QR code per patient. Print the QR sheet, or download the Merge CSV (name + link) for your mail house. Each code maps to exactly one patient — so a scan already knows who they are and the $50 can’t be claimed by anyone else.",
  },
  {
    icon: Send,
    title: "4 · Mark sent",
    body: "When the letters go out, hit “Mark sent.” This promises each patient’s $50 credit and adds the batch to your Personalized Outflow stat for the week — so it shows up on the dashboard automatically.",
  },
  {
    icon: BarChart3,
    title: "5 · Patients scan → you get insights",
    body: "The QR opens a private, no-login form that greets the patient by name. Responses tie to that patient (one per code). You’ll see your response rate, where patients come from, their best quotes, and a $50 credit ledger to mark credits redeemed when used.",
  },
];

export function HowItWorks() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <HelpCircle className="h-4 w-4" />
        How it works
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>How patient surveys work</DialogTitle>
            <DialogDescription>
              Mail a personalized letter with a QR code, capture private
              feedback, and learn who your referrers and biggest fans are.
            </DialogDescription>
          </DialogHeader>

          <ol className="space-y-4 py-2">
            {STEPS.map((s) => {
              const Icon = s.icon;
              return (
                <li key={s.title} className="flex gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">{s.title}</p>
                    <p className="text-sm text-muted-foreground">{s.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
