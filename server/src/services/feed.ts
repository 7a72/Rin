import { and, count, desc, eq, like, or } from "drizzle-orm";
import Elysia, { t } from "elysia";
import { XMLParser } from "fast-xml-parser";
import html2md from 'html-to-md';
import type { DB } from "../_worker";
import { feeds } from "../db/schema";
import { setup } from "../setup";
import { ClientConfig, PublicCache } from "../utils/cache";
import { getDB } from "../utils/di";
import { extractImage } from "../utils/image";
import { bindTagToPost } from "./tag";

export function FeedService() {
    const db: DB = getDB();
    return new Elysia({ aot: false })
        .use(setup())
        .group('/feed', (group) =>
            group
                .get('/', async ({ admin, set, query: { page, limit, type } }) => {
                    if ((type === 'draft' || type === 'private') && !admin) {
                        set.status = 403;
                        return 'Permission denied';
                    }
                    const cache = PublicCache();
                    const page_num = (page ? page > 0 ? page : 1 : 1) - 1;
                    const limit_num = limit ? +limit > 50 ? 50 : +limit : 20;
                    const cacheKey = `feeds_${type}_${page_num}_${limit_num}`;
                    const cached = await cache.get(cacheKey);
                    if (cached) {
                        return cached;
                    }
                    const where = type === 'draft'
                        ? eq(feeds.status, 'draft')
                        : type === 'private'
                        ? eq(feeds.status, 'private')
                        : and(eq(feeds.status, 'publish'), eq(feeds.property, 'post'));
                    const size = await db.select({ count: count() }).from(feeds).where(where);
                    if (size[0].count === 0) {
                        return {
                            size: 0,
                            data: [],
                            hasNext: false
                        }
                    }
                    const feed_list = (await db.query.feeds.findMany({
                        where: where,
                        columns: admin ? undefined : {
                            status: false,
                            property: false
                        },
                        with: {
                            hashtags: {
                                columns: {},
                                with: {
                                    hashtag: {
                                        columns: { id: true, name: true }
                                    }
                                }
                            }, user: {
                                columns: { id: true, username: true, avatar: true }
                            }
                        },
                        orderBy: [desc(feeds.top), desc(feeds.createdAt), desc(feeds.updatedAt)],
                        offset: page_num * limit_num,
                        limit: limit_num + 1,
                    })).map(({ content, hashtags, summary, ...other }) => {
                        // 提取首图
                        const avatar = extractImage(content);
                        return {
                            summary: summary.length > 0 ? summary : content.length > 100 ? content.slice(0, 100) : content,
                            hashtags: hashtags.map(({ hashtag }) => hashtag),
                            avatar,
                            ...other
                        }
                    });
                    let hasNext = false
                    if (feed_list.length === limit_num + 1) {
                        feed_list.pop();
                        hasNext = true;
                    }
                    const data = {
                        size: size[0].count,
                        data: feed_list,
                        hasNext
                    }
                    if (type === undefined || type === 'publish' || type === '')
                        await cache.set(cacheKey, data);
                    return data
                }, {
                    query: t.Object({
                        page: t.Optional(t.Numeric()),
                        limit: t.Optional(t.Numeric()),
                        type: t.Optional(t.String())
                    })
                })
                .get('/timeline', async () => {
                    const where = and(eq(feeds.status, 'publish'), eq(feeds.property, 'post'));
                    return (await db.query.feeds.findMany({
                        where: where,
                        columns: {
                            id: true,
                            title: true,
                            alias: true,
                            createdAt: true,
                        },
                        orderBy: [desc(feeds.createdAt), desc(feeds.updatedAt)],
                    }))
                })
                .post('/', async ({ admin, set, uid, body: { title, alias, content, summary, status, tags, property, createdAt, allowComment } }) => {
                    if (!admin) {
                        set.status = 403;
                        return 'Permission denied';
                    }
                    // input check
                    if (!title) {
                        set.status = 400;
                        return 'Title is required';
                    }
                    if (!content) {
                        set.status = 400;
                        return 'Content is required';
                    }

                    // check exist
                    const exist = await db.query.feeds.findFirst({
                        where: or(eq(feeds.title, title), eq(feeds.content, content))
                    });
                    if (exist) {
                        set.status = 400;
                        return 'Content already exists';
                    }
                    const date = createdAt ? new Date(createdAt) : new Date();
                    const validStatuses = ['publish', 'draft', 'private'];
                    const finalStatus = status && validStatuses.includes(status) ? status : 'publish';
                    const result = await db.insert(feeds).values({
                        title,
                        content,
                        summary,
                        uid,
                        alias,
                        createdAt: date,
                        updatedAt: date,
                        status: finalStatus,
                        property: property || 'post',
                        allowComment: allowComment ? 1 : 0
                    }).returning({ insertedId: feeds.id });
                    await bindTagToPost(db, result[0].insertedId, tags);
                    await PublicCache().deletePrefix('feeds_');
                    if (result.length === 0) {
                        set.status = 500;
                        return 'Failed to insert';
                    } else {
                        return result[0];
                    }
                }, {
                    body: t.Object({
                        title: t.String(),
                        content: t.String(),
                        summary: t.String(),
                        alias: t.Optional(t.String()),
                        status: t.String(),
                        property: t.String(),
                        createdAt: t.Optional(t.Date()),
                        tags: t.Array(t.String()),
                        allowComment: t.Boolean()
                    })
                })
                .get('/:id', async ({ uid, admin, set, params: { id } }) => {
                    const id_num = parseInt(id);
                    const cache = PublicCache();
                    const cacheKey = `feed_${id}`;
                    const feed = await cache.getOrSet(cacheKey, () => (db.query.feeds.findFirst({
                        where: or(eq(feeds.id, id_num), eq(feeds.alias, id)),
                        with: {
                            hashtags: {
                                columns: {},
                                with: {
                                    hashtag: {
                                        columns: { id: true, name: true }
                                    }
                                }
                            }, user: {
                                columns: { id: true, username: true, avatar: true }
                            }
                        }
                    })));
                    if (!feed) {
                        set.status = 404;
                        return 'Not found';
                    }
                    // permission check
                    if (feed.status !== 'publish' && (feed.uid !== uid && !admin)) {
                        set.status = 403;
                        return 'Permission denied';
                    }

                    const { hashtags, ...other } = feed;
                    const hashtags_flatten = hashtags.map((f) => f.hashtag);

                    // update views
                    const newViews = (feed.views || 0) + 1;
                    if (await ClientConfig().getOrDefault('counter.enabled', false)) {
                        await db.update(feeds)
                            .set({ views: newViews })
                            .where(eq(feeds.id, feed.id));
                    }
                    await cache.delete(cacheKey);
                    const data = {
                        ...other,
                        hashtags: hashtags_flatten,
                        views: newViews
                    };
                    return data;
                })
                .post('/:id', async ({
                    admin,
                    set,
                    uid,
                    params: { id },
                    body: { title, content, summary, alias, status, top, tags, createdAt, property, allowComment }
                }) => {
                    const id_num = parseInt(id);
                    const feed = await db.query.feeds.findFirst({
                        where: eq(feeds.id, id_num)
                    });
                    if (!feed) {
                        set.status = 404;
                        return 'Not found';
                    }
                    if (feed.uid !== uid && !admin) {
                        set.status = 403;
                        return 'Permission denied';
                    }
                    const validStatuses = ['publish', 'draft', 'private'];
                    const finalStatus = status && validStatuses.includes(status) ? status : 'publish';
                    await db.update(feeds).set({
                        title,
                        content,
                        summary,
                        alias,
                        top,
                        status: finalStatus,
                        property: property || 'post',
                        allowComment: allowComment ? 1 : 0,
                        createdAt: createdAt ? new Date(createdAt) : undefined,
                        updatedAt: new Date()
                    }).where(eq(feeds.id, id_num));
                    if (tags) {
                        await bindTagToPost(db, id_num, tags);
                    }
                    await clearFeedCache(id_num, feed.alias, alias || null);
                    return 'Updated';
                }, {
                    body: t.Object({
                        title: t.Optional(t.String()),
                        alias: t.Optional(t.String()),
                        content: t.Optional(t.String()),
                        summary: t.Optional(t.String()),
                        createdAt: t.Optional(t.Date()),
                        tags: t.Optional(t.Array(t.String())),
                        status: t.String(),
                        property: t.String(),
                        top: t.Optional(t.Integer()),
                        allowComment: t.Optional(t.Boolean())
                    })
                })
                .post('/top/:id', async ({
                    admin,
                    set,
                    uid,
                    params: { id },
                    body: { top }
                }) => {
                    const id_num = parseInt(id);
                    const feed = await db.query.feeds.findFirst({
                        where: eq(feeds.id, id_num)
                    });
                    if (!feed) {
                        set.status = 404;
                        return 'Not found';
                    }
                    if (feed.uid !== uid && !admin) {
                        set.status = 403;
                        return 'Permission denied';
                    }
                    await db.update(feeds).set({
                        top
                    }).where(eq(feeds.id, feed.id));
                    await clearFeedCache(feed.id, null, null);
                    return 'Updated';
                }, {
                    body: t.Object({
                        top: t.Integer()
                    })
                })
                .delete('/:id', async ({ admin, set, uid, params: { id } }) => {
                    const id_num = parseInt(id);
                    const feed = await db.query.feeds.findFirst({
                        where: eq(feeds.id, id_num)
                    });
                    if (!feed) {
                        set.status = 404;
                        return 'Not found';
                    }
                    if (feed.uid !== uid && !admin) {
                        set.status = 403;
                        return 'Permission denied';
                    }
                    await db.delete(feeds).where(eq(feeds.id, id_num));
                    await clearFeedCache(id_num, feed.alias, null);
                    return 'Deleted';
                })
        )
        .get('/search/:keyword', async ({ admin, params: { keyword }, query: { page, limit } }) => {
            keyword = decodeURI(keyword);
            const cache = PublicCache();
            const page_num = (page ? page > 0 ? page : 1 : 1) - 1;
            const limit_num = limit ? +limit > 50 ? 50 : +limit : 20;
            if (keyword === undefined || keyword.trim().length === 0) {
                return {
                    size: 0,
                    data: [],
                    hasNext: false
                }
            }
            const cacheKey = `search_${keyword}`;
            const searchKeyword = `%${keyword}%`;
            const feed_list = (await cache.getOrSet(cacheKey, () => db.query.feeds.findMany({
                where: or(like(feeds.title, searchKeyword),
                    like(feeds.content, searchKeyword),
                    like(feeds.summary, searchKeyword),
                    like(feeds.alias, searchKeyword)),
                columns: admin ? undefined : {
                    status: false,
                    property: false
                },
                with: {
                    hashtags: {
                        columns: {},
                        with: {
                            hashtag: {
                                columns: { id: true, name: true }
                            }
                        }
                    }, user: {
                        columns: { id: true, username: true, avatar: true }
                    }
                },
                orderBy: [desc(feeds.createdAt), desc(feeds.updatedAt)],
            }))).map(({ content, hashtags, summary, ...other }) => {
                return {
                    summary: summary.length > 0 ? summary : content.length > 100 ? content.slice(0, 100) : content,
                    hashtags: hashtags.map(({ hashtag }) => hashtag),
                    ...other
                }
            });
            if (feed_list.length <= page_num * limit_num) {
                return {
                    size: feed_list.length,
                    data: [],
                    hasNext: false
                }
            } else if (feed_list.length <= page_num * limit_num + limit_num) {
                return {
                    size: feed_list.length,
                    data: feed_list.slice(page_num * limit_num),
                    hasNext: false
                }
            } else {
                return {
                    size: feed_list.length,
                    data: feed_list.slice(page_num * limit_num, page_num * limit_num + limit_num),
                    hasNext: true
                }
            }
        }, {
            query: t.Object({
                page: t.Optional(t.Numeric()),
                limit: t.Optional(t.Numeric()),
            })
        })
        .post('wp', async ({ set, admin, body: { data } }) => {
            if (!admin) {
                set.status = 403;
                return 'Permission denied';
            }
            if (!data) {
                set.status = 400;
                return 'Data is required';
            }
            const xml = await data.text();
            const parser = new XMLParser();
            const result = await parser.parse(xml)
            const items = result.rss.channel.item;
            if (!items) {
                set.status = 404;
                return 'No items found';
            }
            const feedItems: FeedItem[] = items?.map((item: any) => {
                const createdAt = new Date(item?.['wp:post_date']);
                const updatedAt = new Date(item?.['wp:post_modified']);
                const contentHtml = item?.['content:encoded'];
                const content = html2md(contentHtml);
                const summary = content.length > 100 ? content.slice(0, 100) : content;
                let tags = item?.['category'];
                if (tags && Array.isArray(tags)) {
                    tags = tags.map((tag: any) => tag + '');
                } else if (tags && typeof tags === 'string') {
                    tags = [tags];
                }
                let status;
                if (item?.['wp:status'] === 'publish') {
                    status = 'publish';
                } else if (item?.['wp:status'] === 'private') {
                    status = 'private';
                } else {
                    status = 'draft';
                }
                return {
                    title: item.title,
                    summary,
                    content,
                    status,
                    createdAt,
                    updatedAt,
                    tags
                };
            });
            let success = 0;
            let skipped = 0;
            let skippedList: { title: string, reason: string }[] = [];
            for (const item of feedItems) {
                if (!item.content) {
                    skippedList.push({ title: item.title, reason: "no content" });
                    skipped++;
                    continue;
                }
                const exist = await db.query.feeds.findFirst({
                    where: eq(feeds.content, item.content)
                });
                if (exist) {
                    skippedList.push({ title: item.title, reason: "content exists" });
                    skipped++;
                    continue;
                }
                const result = await db.insert(feeds).values({
                    title: item.title,
                    content: item.content,
                    summary: item.summary,
                    uid: 1,
                    status: item.status,
                    property: 'post',
                    createdAt: item.createdAt,
                    updatedAt: item.updatedAt
                }).returning({ insertedId: feeds.id });
                if (item.tags) {
                    await bindTagToPost(db, result[0].insertedId, item.tags);
                }
                success++;
            }
            PublicCache().deletePrefix('feeds_');
            return {
                success,
                skipped,
                skippedList
            };
        }, {
            body: t.Object({
                data: t.File()
            })
        })
}


type FeedItem = {
    title: string;
    summary: string;
    content: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    tags?: string[];
}

async function clearFeedCache(id: number, alias: string | null, newAlias: string | null) {
    const cache = PublicCache()
    await cache.deletePrefix('feeds_');
    await cache.deletePrefix('search_');
    await cache.delete(`feed_${id}`, false);
    if (alias === newAlias) return;
    if (alias)
        await cache.delete(`feed_${alias}`, false);
    if (newAlias)
        await cache.delete(`feed_${newAlias}`, false);
}