import { and, count, desc, eq, like, or } from "drizzle-orm";
import Elysia, { t } from "elysia";
import type { DB } from "../_worker";
import { feeds } from "../db/schema";
import { setup } from "../setup";
import { ClientConfig, PublicCache } from "../utils/cache";
import { getDB } from "../utils/di";
import { extractImage } from "../utils/image";
import { bindMetasToPost } from "./meta";

export function FeedService() {
    const db: DB = getDB();
    return new Elysia({ aot: false })
        .use(setup())
        .group("/feed", (group) =>
            group
                .get("/", async ({ admin, set, query: { page, limit, type } }) => {
                    if ((type === "draft" || type === "private") && !admin) {
                        set.status = 403;
                        return "Permission denied";
                    }
                    const cache = PublicCache();
                    const page_num = (page ? page > 0 ? page : 1 : 1) - 1;
                    const limit_num = limit ? +limit > 50 ? 50 : +limit : 20;
                    const cacheKey = `feeds_${type}_${page_num}_${limit_num}`;
                    const cached = await cache.get(cacheKey);
                    if (cached) {
                        return cached;
                    }
                    const where = type === "draft"
                        ? eq(feeds.status, "draft")
                        : type === "private"
                        ? eq(feeds.status, "private")
                        : and(eq(feeds.status, "publish"), eq(feeds.property, "post"));
                    const size = await db.select({ count: count() }).from(feeds).where(where);
                    if (size[0].count === 0) {
                        return {
                            size: 0,
                            data: [],
                            hasNext: false,
                        };
                    }
                    const feed_list = (await db.query.feeds.findMany({
                        where: where,
                        columns: admin ? undefined : {
                            status: false,
                            property: false,
                        },
                        with: {
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
                            user: {
                                columns: {
                                    id: true,
                                    username: true,
                                    avatar: true,
                                },
                            },
                        },
                        orderBy: [desc(feeds.top), desc(feeds.createdAt)],
                        offset: page_num * limit_num,
                        limit: limit_num + 1,
                    })).map(({ content, metas, summary, ...other }) => {
                        const avatar = extractImage(content);
                        return {
                            summary: summary.length > 0
                                ? summary
                                : content.length > 100
                                ? content.slice(0, 100)
                                : content,
                            // metas: metas.map(({ meta }) => meta),
                            tags: metas
                                .filter(({ meta }) => meta.type === "tag")
                                .map(({ meta }) => meta),
                            categories: metas
                                .filter(({ meta }) => meta.type === "category")
                                .map(({ meta }) => meta),
                            avatar,
                            ...other,
                        };
                    });
                    let hasNext = false;
                    if (feed_list.length === limit_num + 1) {
                        feed_list.pop();
                        hasNext = true;
                    }
                    const data = {
                        size: size[0].count,
                        data: feed_list,
                        hasNext,
                    };
                    if (type === undefined || type === "publish" || type === "") {
                        await cache.set(cacheKey, data);
                    }
                    return data;
                }, {
                    query: t.Object({
                        page: t.Optional(t.Numeric()),
                        limit: t.Optional(t.Numeric()),
                        type: t.Optional(t.String()),
                    }),
                })
                .get("/timeline", async () => {
                    const where = and(eq(feeds.status, "publish"), eq(feeds.property, "post"));
                    return (await db.query.feeds.findMany({
                        where: where,
                        columns: {
                            id: true,
                            title: true,
                            alias: true,
                            createdAt: true,
                        },
                        orderBy: [desc(feeds.createdAt), desc(feeds.updatedAt)],
                    }));
                })
                .post(
                    "/",
                    async (
                        {
                            admin,
                            set,
                            uid,
                            body: {
                                title,
                                alias,
                                content,
                                summary,
                                status,
                                tags,
                                categories,
                                property,
                                createdAt,
                                updatedAt,
                                allowComment,
                            },
                        },
                    ) => {
                        if (!admin) {
                            set.status = 403;
                            return "Permission denied";
                        }
                        // input check
                        if (!title) {
                            set.status = 400;
                            return "Title is required";
                        }
                        if (!content) {
                            set.status = 400;
                            return "Content is required";
                        }

                        // check exist
                        const exist = await db.query.feeds.findFirst({
                            where: or(eq(feeds.title, title), eq(feeds.content, content)),
                        });
                        if (exist) {
                            set.status = 400;
                            return "Content already exists";
                        }

                        const validStatuses = ["publish", "draft", "private"];
                        const finalStatus = status && validStatuses.includes(status) ? status : "publish";
                        const result = await db.insert(feeds).values({
                            title,
                            content,
                            summary,
                            uid,
                            alias,
                            createdAt: createdAt ? new Date(createdAt) : new Date(),
                            updatedAt: updatedAt ? new Date(updatedAt) : new Date(),
                            status: finalStatus,
                            property: property || "post",
                            allowComment: allowComment ? 1 : 0,
                        }).returning({ insertedId: feeds.id });

                        if (result.length === 0) {
                            set.status = 500;
                            return "Failed to insert";
                        }

                        const feedId = result[0].insertedId;

                        // 分别处理标签和分类
                        if (tags && tags.length > 0) {
                            await bindMetasToPost(db, feedId, tags, "tag");
                        }
                        if (categories && categories.length > 0) {
                            await bindMetasToPost(db, feedId, categories, "category");
                        }

                        await PublicCache().deletePrefix("feeds_");
                        return result[0];
                    },
                    {
                        body: t.Object({
                            title: t.String(),
                            content: t.String(),
                            summary: t.String(),
                            alias: t.Optional(t.String()),
                            status: t.String(),
                            property: t.String(),
                            createdAt: t.Optional(t.Date()),
                            updatedAt: t.Optional(t.Date()),
                            tags: t.Array(t.String()),
                            categories: t.Optional(t.Array(t.String())),
                            allowComment: t.Boolean(),
                        }),
                    },
                )
                .get("/:id", async ({ uid, admin, set, params: { id } }) => {
                    const id_num = parseInt(id);
                    const cache = PublicCache();
                    const cacheKey = `feed_${id}`;
                    const feed = await cache.getOrSet(cacheKey, () => (db.query.feeds.findFirst({
                        where: or(eq(feeds.id, id_num), eq(feeds.alias, id)),
                        with: {
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
                            user: {
                                columns: { id: true, username: true, avatar: true },
                            },
                        },
                    })));
                    if (!feed) {
                        set.status = 404;
                        return "Not found";
                    }
                    // permission check
                    if (feed.status !== "publish" && (feed.uid !== uid && !admin)) {
                        set.status = 403;
                        return "Permission denied";
                    }

                    const { metas, ...other } = feed;

                    const tags = metas
                        .filter(({ meta }) => meta.type === "tag")
                        .map(({ meta }) => meta);
                    const categories = metas
                        .filter(({ meta }) => meta.type === "category")
                        .map(({ meta }) => meta);

                    // update views
                    const newViews = (feed.views || 0) + 1;
                    if (await ClientConfig().getOrDefault("counter.enabled", false)) {
                        await db.update(feeds)
                            .set({ views: newViews })
                            .where(eq(feeds.id, feed.id));
                    }
                    await cache.delete(cacheKey);
                    const data = {
                        ...other,
                        tags: tags,
                        categories: categories,
                        views: newViews,
                    };
                    return data;
                })
                .post("/:id", async ({
                    admin,
                    set,
                    uid,
                    params: { id },
                    body: {
                        title,
                        content,
                        summary,
                        alias,
                        status,
                        top,
                        tags,
                        categories,
                        createdAt,
                        updatedAt,
                        property,
                        allowComment,
                    },
                }) => {
                    const id_num = parseInt(id);
                    const feed = await db.query.feeds.findFirst({
                        where: eq(feeds.id, id_num),
                    });
                    if (!feed) {
                        set.status = 404;
                        return "Not found";
                    }
                    if (feed.uid !== uid && !admin) {
                        set.status = 403;
                        return "Permission denied";
                    }
                    const validStatuses = ["publish", "draft", "private"];
                    const finalStatus = status && validStatuses.includes(status) ? status : "publish";
                    await db.update(feeds).set({
                        title,
                        content,
                        summary,
                        alias,
                        top,
                        status: finalStatus,
                        property: property || "post",
                        allowComment: allowComment ? 1 : 0,
                        createdAt: createdAt ? new Date(createdAt) : undefined,
                        updatedAt: updatedAt ? new Date(updatedAt) : undefined,
                    }).where(eq(feeds.id, id_num));
                    if (tags) {
                        await bindMetasToPost(db, id_num, tags, "tag");
                    }
                    if (categories) {
                        await bindMetasToPost(db, id_num, categories, "category");
                    }
                    await clearFeedCache(id_num, feed.alias, alias || null);
                    return "Updated";
                }, {
                    body: t.Object({
                        title: t.Optional(t.String()),
                        alias: t.Optional(t.String()),
                        content: t.Optional(t.String()),
                        summary: t.Optional(t.String()),
                        createdAt: t.Optional(t.Date()),
                        updatedAt: t.Optional(t.Date()),
                        tags: t.Optional(t.Array(t.String())),
                        categories: t.Optional(t.Array(t.String())),
                        status: t.String(),
                        property: t.String(),
                        top: t.Optional(t.Integer()),
                        allowComment: t.Optional(t.Boolean()),
                    }),
                })
                .post("/top/:id", async ({
                    admin,
                    set,
                    uid,
                    params: { id },
                    body: { top },
                }) => {
                    const id_num = parseInt(id);
                    const feed = await db.query.feeds.findFirst({
                        where: eq(feeds.id, id_num),
                    });
                    if (!feed) {
                        set.status = 404;
                        return "Not found";
                    }
                    if (feed.uid !== uid && !admin) {
                        set.status = 403;
                        return "Permission denied";
                    }
                    await db.update(feeds).set({
                        top,
                    }).where(eq(feeds.id, feed.id));
                    await clearFeedCache(feed.id, null, null);
                    return "Updated";
                }, {
                    body: t.Object({
                        top: t.Integer(),
                    }),
                })
                .delete("/:id", async ({ admin, set, uid, params: { id } }) => {
                    const id_num = parseInt(id);
                    const feed = await db.query.feeds.findFirst({
                        where: eq(feeds.id, id_num),
                    });
                    if (!feed) {
                        set.status = 404;
                        return "Not found";
                    }
                    if (feed.uid !== uid && !admin) {
                        set.status = 403;
                        return "Permission denied";
                    }
                    await db.delete(feeds).where(eq(feeds.id, id_num));
                    await clearFeedCache(id_num, feed.alias, null);
                    return "Deleted";
                }))
        .get("/search/:keyword", async ({ admin, params: { keyword }, query: { page, limit } }) => {
            keyword = decodeURI(keyword);
            const cache = PublicCache();
            const page_num = (page ? page > 0 ? page : 1 : 1) - 1;
            const limit_num = limit ? +limit > 50 ? 50 : +limit : 20;
            if (keyword === undefined || keyword.trim().length === 0) {
                return {
                    size: 0,
                    data: [],
                    hasNext: false,
                };
            }
            const cacheKey = `search_${keyword}`;
            const searchKeyword = `%${keyword}%`;
            const feed_list = (await cache.getOrSet(cacheKey, () =>
                db.query.feeds.findMany({
                    where: or(
                        like(feeds.title, searchKeyword),
                        like(feeds.content, searchKeyword),
                        like(feeds.summary, searchKeyword),
                        like(feeds.alias, searchKeyword),
                    ),
                    columns: admin ? undefined : {
                        status: false,
                        property: false,
                    },
                    with: {
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
                        user: {
                            columns: { id: true, username: true, avatar: true },
                        },
                    },
                    orderBy: [desc(feeds.createdAt), desc(feeds.updatedAt)],
                }))).map(({ content, metas, summary, ...other }) => {
                    const tags = metas
                        .filter(({ meta }) => meta.type === "tag")
                        .map(({ meta }) => meta);
                    const categories = metas
                        .filter(({ meta }) => meta.type === "category")
                        .map(({ meta }) => meta);
                    return {
                        summary: summary.length > 0 ? summary : content.length > 100 ? content.slice(0, 100) : content,
                        tags,
                        categories,
                        ...other,
                    };
                });
            if (feed_list.length <= page_num * limit_num) {
                return {
                    size: feed_list.length,
                    data: [],
                    hasNext: false,
                };
            } else if (feed_list.length <= page_num * limit_num + limit_num) {
                return {
                    size: feed_list.length,
                    data: feed_list.slice(page_num * limit_num),
                    hasNext: false,
                };
            } else {
                return {
                    size: feed_list.length,
                    data: feed_list.slice(page_num * limit_num, page_num * limit_num + limit_num),
                    hasNext: true,
                };
            }
        }, {
            query: t.Object({
                page: t.Optional(t.Numeric()),
                limit: t.Optional(t.Numeric()),
            }),
        });
}

async function clearFeedCache(id: number, alias: string | null, newAlias: string | null) {
    const cache = PublicCache();
    await cache.deletePrefix("feeds_");
    await cache.deletePrefix("search_");
    await cache.deletePrefix("meta_");
    await cache.delete(`feed_${id}`, false);
    if (alias === newAlias) return;
    if (alias) {
        await cache.delete(`feed_${alias}`, false);
    }
    if (newAlias) {
        await cache.delete(`feed_${newAlias}`, false);
    }
}
