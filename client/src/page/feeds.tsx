import { useContext, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useSearch } from "wouter";
import { FeedCard } from "../components/feed_card";
import { Waiting } from "../components/loading";
import { client } from "../main";
import { ProfileContext } from "../state/profile";
import { headersWithAuth } from "../utils/auth";
import { siteName } from "../utils/constants";
import { tryInt } from "../utils/int";

type FeedsData = {
    size: number;
    data: any[];
    hasNext: boolean;
};

type FeedType = "draft" | "private" | "publish";

type FeedsMap = {
    [key in FeedType]: FeedsData;
};

export function FeedsPage() {
    const { t } = useTranslation();
    const query = new URLSearchParams(useSearch());
    const profile = useContext(ProfileContext);
    const [listState, _setListState] = useState<FeedType>(query.get("type") as FeedType || "publish");
    const [status, setStatus] = useState<"loading" | "idle">("idle");
    const [feeds, setFeeds] = useState<FeedsMap>({
        draft: { size: 0, data: [], hasNext: false },
        private: { size: 0, data: [], hasNext: false },
        publish: { size: 0, data: [], hasNext: false },
    });
    const page = tryInt(1, query.get("page"));
    const limit = tryInt(10, query.get("limit"), process.env.PAGE_SIZE);
    const ref = useRef("");
    function fetchFeeds(type: FeedType) {
        client.feed.index.get({
            query: {
                page: page,
                limit: limit,
                type: type,
            },
            headers: headersWithAuth(),
        }).then(({ data }) => {
            if (data && typeof data !== "string") {
                setFeeds({
                    ...feeds,
                    [type]: data,
                });
                setStatus("idle");
            }
        });
    }
    useEffect(() => {
        const key = `${query.get("page")} ${query.get("type")}`;
        if (ref.current == key) return;
        const type = query.get("type") as FeedType || "publish";
        if (type !== listState) {
            _setListState(type);
        }
        setStatus("loading");
        fetchFeeds(type);
        ref.current = key;
    }, [query.get("page"), query.get("type")]);
    return (
        <>
            <Helmet>
                <title>{`${process.env.NAME}`}</title>
                <meta property="og:site_name" content={siteName} />
                <meta property="og:title" content={t("article.title")} />
                <meta property="og:image" content={process.env.AVATAR} />
                <meta property="og:type" content="article" />
                <meta property="og:url" content={document.URL} />
            </Helmet>
            <Waiting for={feeds.draft.size + feeds.publish.size + feeds.private.size > 0 || status === "idle"}>
                <main className="w-full flex flex-col justify-center items-center mb-8">
                    <div className="wauto text-start text-black dark:text-white py-4">
                        <div className="flex flex-row justify-between">
                            <p className="text-sm mt-4 text-neutral-500 font-normal">
                                {t("article.total$count", { count: feeds[listState]?.size })}
                            </p>
                            {profile?.permission
                                && (
                                    <div className="flex flex-row space-x-4">
                                        <Link
                                            href={listState === "draft" ? "/?type=publish" : "/?type=draft"}
                                            className={`text-sm mt-4 text-neutral-500 font-normal ${
                                                listState === "draft" ? "text-theme" : ""
                                            }`}
                                        >
                                            {t("draft_bin")}
                                        </Link>
                                        <Link
                                            href={listState === "private" ? "/?type=publish" : "/?type=private"}
                                            className={`text-sm mt-4 text-neutral-500 font-normal ${
                                                listState === "private" ? "text-theme" : ""
                                            }`}
                                        >
                                            {t("unlisted")}
                                        </Link>
                                    </div>
                                )}
                        </div>
                    </div>
                    <Waiting for={status === "idle"}>
                        <div className="wauto flex flex-col ani-show">
                            {feeds[listState].data.map(({ id, alias, ...feed }: any) => (
                                <FeedCard key={id} id={id} alias={alias} {...feed} />
                            ))}
                        </div>
                        <div className="wauto flex flex-row items-center mt-4 ani-show">
                            {page > 1
                                && (
                                    <Link
                                        href={`/?type=${listState}&page=${(page - 1)}`}
                                        className={`text-sm font-normal rounded-full px-4 py-2 text-white bg-theme`}
                                    >
                                        {t("previous")}
                                    </Link>
                                )}
                            <div className="flex-1" />
                            {feeds[listState]?.hasNext
                                && (
                                    <Link
                                        href={`/?type=${listState}&page=${(page + 1)}`}
                                        className={`text-sm font-normal rounded-full px-4 py-2 text-white bg-theme`}
                                    >
                                        {t("next")}
                                    </Link>
                                )}
                        </div>
                    </Waiting>
                </main>
            </Waiting>
        </>
    );
}
