import { createClient } from "npm:@supabase/supabase-js@2";

type NotificationRecord = {
  id: string;
  user_id: string;
  actor_user_id: string | null;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

type DatabaseWebhookPayload = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: NotificationRecord | null;
  old_record: NotificationRecord | null;
};

type PushTokenRow = {
  id: string;
  expo_push_token: string;
};

type ExpoPushTicket = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: {
    error?: string;
  };
};

const corsHeaders = {
  "Content-Type": "application/json",
};

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({
        error: "Method not allowed.",
      }),
      {
        status: 405,
        headers: corsHeaders,
      },
    );
  }

  const expectedSecret = Deno.env.get("PUSH_WEBHOOK_SECRET");
  const receivedSecret = request.headers.get("x-webhook-secret");

  if (!expectedSecret || receivedSecret !== expectedSecret) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized.",
      }),
      {
        status: 401,
        headers: corsHeaders,
      },
    );
  }

  try {
    const payload = (await request.json()) as DatabaseWebhookPayload;

    if (
      payload.type !== "INSERT" ||
      payload.table !== "notifications" ||
      !payload.record
    ) {
      return new Response(
        JSON.stringify({
          skipped: true,
        }),
        {
          status: 200,
          headers: corsHeaders,
        },
      );
    }

    const notification = payload.record;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
    const legacyServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    let secretKey: string | null = legacyServiceRoleKey ?? null;

    if (!secretKey && secretKeys) {
      try {
        const parsedKeys = JSON.parse(secretKeys) as Record<string, string>;
        secretKey =
          parsedKeys.secret ??
          parsedKeys.service_role ??
          Object.values(parsedKeys)[0] ??
          null;
      } catch {
        secretKey = null;
      }
    }

    if (!supabaseUrl || !secretKey) {
      throw new Error("Supabase server credentials are unavailable.");
    }

    const supabase = createClient(supabaseUrl, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: tokenRows, error: tokenError } = await supabase
      .from("push_tokens")
      .select("id, expo_push_token")
      .eq("user_id", notification.user_id)
      .eq("is_active", true);

    if (tokenError) {
      throw tokenError;
    }

    const tokens = (tokenRows ?? []) as PushTokenRow[];

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({
          sent: 0,
          reason: "No active push tokens.",
        }),
        {
          status: 200,
          headers: corsHeaders,
        },
      );
    }

    const notificationData = notification.data ?? {};

    const messages = tokens.map((token) => ({
      to: token.expo_push_token,
      sound: "default",
      title: notification.title,
      body: notification.body,
      data: {
        ...notificationData,
        notification_id: notification.id,
        type: notification.type,
      },
      channelId: "default",
      priority: "high",
    }));

    const expoResponse = await fetch(
      "https://exp.host/--/api/v2/push/send",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
      },
    );

    const expoPayload = await expoResponse.json();

    if (!expoResponse.ok) {
      throw new Error(
        `Expo Push API error: ${JSON.stringify(expoPayload)}`,
      );
    }

    const tickets = Array.isArray(expoPayload.data)
      ? (expoPayload.data as ExpoPushTicket[])
      : [];

    const invalidTokenIds: string[] = [];

    tickets.forEach((ticket, index) => {
      if (
        ticket.status === "error" &&
        ticket.details?.error === "DeviceNotRegistered" &&
        tokens[index]
      ) {
        invalidTokenIds.push(tokens[index].id);
      }
    });

    if (invalidTokenIds.length > 0) {
      const { error: deactivateError } = await supabase
        .from("push_tokens")
        .update({
          is_active: false,
          last_seen_at: new Date().toISOString(),
        })
        .in("id", invalidTokenIds);

      if (deactivateError) {
        console.log("DEACTIVATE INVALID TOKENS ERROR:", deactivateError);
      }
    }

    return new Response(
      JSON.stringify({
        sent: messages.length,
        invalid_tokens_deactivated: invalidTokenIds.length,
        tickets,
      }),
      {
        status: 200,
        headers: corsHeaders,
      },
    );
  } catch (error) {
    console.log("SEND PUSH NOTIFICATION ERROR:", error);

    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "Unknown push notification error.",
      }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
});
