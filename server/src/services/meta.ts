// meta.ts
import { and, eq, or } from "drizzle-orm";
import Elysia from "elysia";
import type { DB } from "../_worker";
import { feedMetas, metas } from "../db/schema";
import { setup } from "../setup";
import { getDB } from "../utils/di";

export function MetaService() {
    const db: DB = getDB();
    return new Elysia({ aot: false })
        .use(setup())
        .group("/meta", (group) =>
            group
                .get("/", async ({ query: { type } }) => {
                    const meta_list = await db.query.metas.findMany({
                        where: type ? eq(metas.type, type) : undefined,
                        with: {
                            feeds: {
                                columns: { feedId: true },
                            },
                        },
                    });
                    return meta_list.map((meta) => ({
                        ...meta,
                        feeds: meta.feeds.length,
                    }));
                })
                .get("/:name", async ({ admin, set, params: { name } }) => {
                    const nameDecoded = decodeURI(name);
                    const meta = await db.query.metas.findFirst({
                        where: or(
                            eq(metas.alias, nameDecoded),
                            eq(metas.name, nameDecoded),
                        ),
                        with: {
                            feeds: {
                                with: {
                                    feed: {
                                        columns: {
                                            id: true,
                                            alias: true,
                                            title: true,
                                            summary: true,
                                            content: true,
                                            createdAt: true,
                                            updatedAt: true,
                                            status: false,
                                            property: false,
                                        },
                                        with: {
                                            user: {
                                                columns: {
                                                    id: true,
                                                    username: true,
                                                    avatar: true,
                                                },
                                            },
                                            metas: {
                                                columns: {},
                                                with: {
                                                    meta: {
                                                        columns: {
                                                            id: true,
                                                            name: true,
                                                            type: true,
                                                        },
                                                    },
                                                },
                                            },
                                        },
                                        where: (feeds: any) => admin ? undefined : eq(feeds.status, "publish"),
                                    } as any,
                                },
                            },
                        },
                    });

                    if (!meta) {
                        set.status = 404;
                        return "Not found";
                    }

                    const metaFeeds = meta.feeds
                        .map((feed: any) => {
                            if (!feed.feed) return null;

                            const metas = feed.feed.metas.map((m: any) => m.meta);

                            return {
                                ...feed.feed,
                                tags: metas
                                    .filter((meta: any) => meta.type === "tag"),
                                categories: metas
                                    .filter((meta: any) => meta.type === "category"),
                            };
                        })
                        .filter((feed: any) => feed !== null);

                    return {
                        ...meta,
                        feeds: metaFeeds,
                    };
                }));
}

export async function bindMetasToPost(db: DB, feedId: number, metaNames: string[], type: string = "tag") {
    await db.delete(feedMetas)
        .where(and(
            eq(feedMetas.feedId, feedId),
            eq(feedMetas.type, type),
        ));

    for (const name of metaNames) {
        const metaId = await getMetaIdOrCreate(db, name, type);
        await db.insert(feedMetas).values({
            feedId,
            metaId,
            type,
        });
    }
}

async function getMetaByName(db: DB, name: string, type: string) {
    return await db.query.metas.findFirst({
        where: and(
            eq(metas.name, name),
            eq(metas.type, type),
        ),
    });
}

async function getMetaIdOrCreate(db: DB, name: string, type: string) {
    const meta = await getMetaByName(db, name, type);
    if (meta) {
        return meta.id;
    } else {
        const result = await db.insert(metas).values({
            name,
            type,
            alias: generateAlias(name),
        }).returning({ insertedId: metas.id });

        if (result.length === 0) {
            throw new Error("Failed to insert meta");
        }
        return result[0].insertedId;
    }
}

function generateAlias(name: string): string {
    return name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "");
}
