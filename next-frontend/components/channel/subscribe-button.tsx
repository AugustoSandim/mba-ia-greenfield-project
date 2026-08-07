"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

type SubscribeButtonProps = {
  nickname: string;
  initialSubscribed: boolean;
};

export function SubscribeButton({ nickname, initialSubscribed }: SubscribeButtonProps) {
  const router = useRouter();
  const [isSubscribed, setIsSubscribed] = useState(initialSubscribed);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleClick() {
    setIsSubmitting(true);
    const nextSubscribed = !isSubscribed;
    const response = await fetch(`/api/channels/${nickname}/subscription`, {
      method: nextSubscribed ? "POST" : "DELETE",
    });

    if (response.ok) {
      setIsSubscribed(nextSubscribed);
      router.refresh();
    }

    setIsSubmitting(false);
  }

  return (
    <Button type="button" size="md" onClick={handleClick} disabled={isSubmitting}>
      {isSubscribed ? "Subscribed" : "Subscribe"}
    </Button>
  );
}
