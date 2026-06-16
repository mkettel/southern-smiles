"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogTrigger,
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
  ShieldCheck,
} from "lucide-react";

const STEPS = [
  {
    icon: Users,
    title: "1 · Import your patients",
    body: "Upload a CSV of your patient list. Only anonymous stats (visit count, spend, recency) are saved — names, phones, and emails are never stored. Those stay in your file, so keep it. Insights about each person still build up across every mailing.",
  },
  {
    icon: FilePlus2,
    title: "2 · Create a campaign",
    body: "A campaign is one mailing. Write the questions you want and set the $50 appreciation credit. You can use different questions for every mailing.",
  },
  {
    icon: QrCode,
    title: "3 · Enroll & print",
    body: "“Enroll all patients” mints a unique QR code per patient. To print, open Mail merge and upload your patient list again — your browser matches each person to their code and builds personalized letters (“Dear Jane” + QR) to print or save as PDF for your mail house. The names are matched in your browser and never sent to us. Each code maps to exactly one patient, so the $50 can’t be claimed by anyone else.",
  },
  {
    icon: Send,
    title: "4 · Mark sent",
    body: "When the letters go out, hit “Mark sent.” This promises each patient’s $50 credit and adds the batch to your Personalized Outflow stat for the week — so it shows up on the dashboard automatically.",
  },
  {
    icon: BarChart3,
    title: "5 · Patients scan → you get insights",
    body: "The QR opens a private, no-login form. Responses tie to that patient’s code (one per code). You’ll see your response rate, where patients come from, their best quotes, and a $50 credit ledger to mark credits redeemed when used.",
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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>How patient surveys work</DialogTitle>
          <DialogDescription>
            Mail a personalized letter with a QR code, capture private feedback,
            and learn who your referrers and biggest fans are.
          </DialogDescription>
        </DialogHeader>

        <ol className="py-1">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const last = i === STEPS.length - 1;
            return (
              <li key={s.title} className="flex gap-3.5">
                <div className="flex flex-col items-center">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  {!last && <span className="my-1 w-px flex-1 bg-border" />}
                </div>
                <div className={cn("flex-1", last ? "pb-0" : "pb-6")}>
                  <p className="pt-1.5 text-sm font-medium leading-tight">
                    {s.title}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {s.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="flex gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-medium">Private by design</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Patient names, phones, and emails never reach our servers — they
              stay on your computer and are only matched to survey codes inside
              your browser. No protected patient information is stored here, so
              the system stays out of HIPAA scope.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
