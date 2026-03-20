export type RequestAuth = {
  apiKey?: string | null;
  bearer?: string | null;
};

export type HostedAuthState = {
  kind: "none" | "apiKey" | "browser";
  label: string;
  email?: string;
};

export type HostedChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type HostedHistoryItem<Mode extends string = string> = {
  id: string;
  title: string;
  mode: Mode;
  updatedAt?: string | null;
};

export type HostedTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

export type HostedMeResponse = {
  success?: boolean;
  data?: {
    email?: string;
  };
};
