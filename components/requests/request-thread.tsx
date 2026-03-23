"use client";

import { useState, useTransition, useEffect } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  getComments,
  addComment,
  type RequestComment,
} from "@/actions/requests";
import { format } from "date-fns";
import { Send } from "lucide-react";

interface RequestThreadProps {
  requestId: string;
  commentCount: number;
}

export function RequestThread({ requestId, commentCount }: RequestThreadProps) {
  const [comments, setComments] = useState<RequestComment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  // Load comments on first expand
  useEffect(() => {
    if (!loaded) {
      getComments(requestId).then((data) => {
        setComments(data);
        setLoaded(true);
      });
    }
  }, [requestId, loaded]);

  function handleSubmit() {
    if (!message.trim()) return;

    startTransition(async () => {
      const result = await addComment(requestId, message);
      if (result.error) {
        toast.error(
          typeof result.error === "string" ? result.error : "Failed to send"
        );
      } else {
        setMessage("");
        // Refresh comments
        const updated = await getComments(requestId);
        setComments(updated);
      }
    });
  }

  return (
    <div className="mt-3 border-t pt-3 space-y-3">
      {/* Messages */}
      {comments.length > 0 ? (
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-2">
              <div className="flex-1 rounded-lg bg-muted/50 px-3 py-2">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium">
                    {comment.profile?.full_name ?? "Unknown"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(comment.created_at), "MMM d, h:mm a")}
                  </span>
                </div>
                <p className="text-sm">{comment.message}</p>
              </div>
            </div>
          ))}
        </div>
      ) : loaded ? (
        <p className="text-xs text-muted-foreground">
          No comments yet. Start the conversation.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Loading...</p>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message..."
          className="text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={isPending || !message.trim()}
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
