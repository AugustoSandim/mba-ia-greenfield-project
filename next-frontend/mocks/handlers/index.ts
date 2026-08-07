import { handlers as authHandlers } from "./auth";
import { handlers as seedHandlers } from "./_seed";
import { handlers as streamtubeHandlers } from "./streamtube";

export const handlers = [...authHandlers, ...streamtubeHandlers, ...seedHandlers];
