import cors from "@elysiajs/cors";
import { serverTiming } from "@elysiajs/server-timing";
import { Elysia } from "elysia";
import { CommentService } from "./services/comments";
import { ConfigService } from "./services/config";
import { FeedService } from "./services/feed";
import { FriendService } from "./services/friends";
import { MetaService } from "./services/meta";
import { RSSService } from "./services/rss";
import { SEOService } from "./services/seo";
import { StorageService } from "./services/storage";
import { UserService } from "./services/user";

export const app = () =>
    new Elysia({ aot: false })
        .use(cors({
            aot: false,
            origin: "*",
            methods: "*",
            allowedHeaders: [
                "authorization",
                "content-type",
            ],
            maxAge: 600,
            credentials: true,
            preflight: true,
        }))
        .use(serverTiming({
            enabled: true,
        }))
        .use(UserService())
        .use(FeedService())
        .use(CommentService())
        .use(MetaService())
        .use(StorageService())
        .use(FriendService())
        .use(SEOService())
        .use(RSSService())
        .use(ConfigService())
        .get("/", () => `Hi`)
        .onError(({ path, params, code }) => {
            if (code === "NOT_FOUND") {
                return `${path} ${JSON.stringify(params)} not found`;
            }
        });

export type App = ReturnType<typeof app>;
