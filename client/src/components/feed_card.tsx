import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { timeago } from "../utils/timeago";
import { MetaCategory } from "./meta";
import { useMemo } from "react";

export function FeedCard({
    id,
    alias,
    title,
    avatar,
    status,
    top,
    summary,
    tags,
    categories,
    createdAt,
    updatedAt,
}: {
    id: string;
    alias?: string;
    avatar?: string;
    status: "publish" | "draft" | "private";
    top?: number;
    title: string;
    summary: string;
    tags: { id: number; name: string; type: string }[];
    categories: { id: number; name: string; type: string }[];
    createdAt: Date;
    updatedAt: Date;
}) {
    const { t } = useTranslation();
    const postLink = alias ? `/posts/${alias}` : `/posts/${id}`;

    return useMemo(() => (
        <>
            <Link href={postLink} target="_blank" className="w-full rounded-2xl bg-w my-2 p-6 duration-300 bg-button">
                {avatar
                    && (
                        <div className="flex flex-row items-center mb-2 rounded-xl overflow-clip">
                            <img
                                src={avatar}
                                alt=""
                                className="object-cover object-center w-full max-h-96 hover:scale-105 translation duration-300"
                            />
                        </div>
                    )}
                <h1 className="text-xl font-bold text-gray-700 dark:text-white text-pretty overflow-hidden">
                    {title}
                </h1>
                <p className="space-x-2">
                    <span className="text-gray-400 text-sm" title={new Date(createdAt).toLocaleString()}>
                        {createdAt === updatedAt
                            ? timeago(createdAt)
                            : t("feed_card.published$time", { time: timeago(createdAt) })}
                    </span>
                    {createdAt !== updatedAt
                        && (
                            <span className="text-gray-400 text-sm" title={new Date(updatedAt).toLocaleString()}>
                                {t("feed_card.updated$time", { time: timeago(updatedAt) })}
                            </span>
                        )}
                </p>
                <p className="space-x-2">
                    {status === "draft" && <span className="text-gray-400 text-sm">{t("draft")}</span>}
                    {status === "private" && <span className="text-gray-400 text-sm">{t("private")}</span>}
                    {top === 1 && <span className="text-theme text-sm">{t("top.title")}</span>}
                </p>
                <p className="text-pretty overflow-hidden dark:text-neutral-500">
                    {summary}
                </p>
                {categories.length > 0
                    && (
                        <div className="mt-2 flex flex-row flex-wrap justify-start gap-x-2">
                            {categories.map(({ name }, index) => <MetaCategory key={index} name={name} />)}
                        </div>
                    )}
            </Link>
        </>
    ), [id, alias, title, avatar, status, top, summary, tags, categories, createdAt, updatedAt]);
}
