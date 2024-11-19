import { relations, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const created_at = integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull();
const updated_at = integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`).notNull();

export const feeds = sqliteTable("feeds", {
    id: integer("id").primaryKey(),
    alias: text("alias"),
    title: text("title"),
    summary: text("summary").default("").notNull(),
    content: text("content").notNull(),
    property: text("property").default("post").notNull(),
    top: integer("top").default(0).notNull(),
    uid: integer("uid").references(() => users.id).notNull(),
    allowComment: integer("allow_comment").default(1).notNull(),
    status: text("status").default("publish").notNull(),
    views: integer("views").default(0).notNull(),
    createdAt: created_at,
    updatedAt: updated_at,
});

export const info = sqliteTable("info", {
    key: text("key").notNull().unique(),
    value: text("value").notNull(),
});

export const friends = sqliteTable("friends", {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    desc: text("desc"),
    avatar: text("avatar").notNull(),
    url: text("url").notNull(),
    uid: integer("uid").references(() => users.id, { onDelete: "cascade" }).notNull(),
    accepted: integer("accepted").default(0).notNull(),
    health: text("health").default("").notNull(),
    createdAt: created_at,
    updatedAt: updated_at,
});

export const users = sqliteTable("users", {
    id: integer("id").primaryKey(),
    username: text("username").notNull(),
    openid: text("openid").notNull(),
    avatar: text("avatar"),
    permission: integer("permission").default(0),
    createdAt: created_at,
    updatedAt: updated_at,
});

export const comments = sqliteTable("comments", {
    id: integer("id").primaryKey(),
    feedId: integer("feed_id").references(() => feeds.id, { onDelete: "cascade" }).notNull(),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    content: text("content").notNull(),
    createdAt: created_at,
    updatedAt: updated_at,
});

export const commentsRelations = relations(comments, ({ one }) => ({
    feed: one(feeds, {
        fields: [comments.feedId],
        references: [feeds.id],
    }),
    user: one(users, {
        fields: [comments.userId],
        references: [users.id],
    }),
}));

// 新的metas表替代原来的hashtags表
export const metas = sqliteTable("metas", {
    id: integer("id").primaryKey(),
    name: text("name").notNull(), // 显示名称
    alias: text("alias"), // 别名,用于URL
    type: text("type").notNull(), // 类型: 'tag' 或 'category'
    description: text("description"), // 描述
    parent: integer("parent"), // 父级ID,主要用于分类的层级关系
    createdAt: created_at,
    updatedAt: updated_at,
});

// 重命名原feed_hashtags为feed_metas关联表
export const feedMetas = sqliteTable("feed_metas", {
    feedId: integer("feed_id").references(() => feeds.id, { onDelete: "cascade" }).notNull(),
    metaId: integer("meta_id").references(() => metas.id, { onDelete: "cascade" }).notNull(),
    type: text("type").notNull(), // 关联类型: 'tag' 或 'category'
    createdAt: created_at,
    updatedAt: updated_at,
});

// 更新feeds表的关系定义
export const feedsRelations = relations(feeds, ({ many, one }) => ({
    metas: many(feedMetas),
    user: one(users, {
        fields: [feeds.uid],
        references: [users.id],
    }),
    comments: many(comments),
}));

// 添加metas的关系定义
export const metasRelations = relations(metas, ({ many, one }) => ({
    feeds: many(feedMetas),
    parent: one(metas, {
        fields: [metas.parent],
        references: [metas.id],
    }),
}));

// 添加feed_metas的关系定义
export const feedMetasRelations = relations(feedMetas, ({ one }) => ({
    feed: one(feeds, {
        fields: [feedMetas.feedId],
        references: [feeds.id],
    }),
    meta: one(metas, {
        fields: [feedMetas.metaId],
        references: [metas.id],
    }),
}));
