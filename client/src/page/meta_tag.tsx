import { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { FeedCard } from "../components/feed_card";
import { Waiting } from "../components/loading";
import { client } from "../main";
import { headersWithAuth } from "../utils/auth";
import { siteName } from "../utils/constants";

type FeedsData = {
    id: number;
    name: string;
    alias: string | null; // Changed from string | undefined
    type: string;
    description: string | null; // Changed from string | undefined
    parent: number | null; // Changed from string
    createdAt: Date;
    updatedAt: Date;
    feeds: {
        id: number;
        alias: string | null; // Changed from string | undefined
        title: string | null;
        summary: string;
        content: string;
        createdAt: Date;
        updatedAt: Date;
        user: {
            id: number;
            username: string;
            avatar: string | null;
        };
        tags: {
            name: string;
            id: number;
            type: string;
        }[];
        categories: {
            name: string;
            id: number;
            type: string;
        }[];
    }[];
};

export function MetaTagPage({ name }: { name: string }) {
    const { t } = useTranslation();
    const [status, setStatus] = useState<"loading" | "idle">("idle");
    const [metatag, setMetatag] = useState<FeedsData>();
    const ref = useRef("");
    function fetchFeeds() {
        const nameDecoded = decodeURI(name);
        client.meta({ name: nameDecoded }).get({
            headers: headersWithAuth(),
        }).then(({ data }) => {
            if (data && typeof data !== "string") {
                setMetatag(data);
                setStatus("idle");
            }
        });
    }
    useEffect(() => {
        if (ref.current === name) return;
        setStatus("loading");
        fetchFeeds();
        ref.current = name;
    }, [name]);
    return (
        <>
            <Helmet>
                <title>{`${metatag?.name} - ${process.env.NAME}`}</title>
                <meta property="og:site_name" content={siteName} />
                <meta property="og:title" content={metatag?.name} />
                <meta property="og:image" content={process.env.AVATAR} />
                <meta property="og:type" content="article" />
                <meta property="og:url" content={document.URL} />
            </Helmet>
            <Waiting for={metatag || status === "idle"}>
                <main className="w-full flex flex-col justify-center items-center mb-8">
                    <div className="wauto text-start text-black dark:text-white py-4 text-4xl font-medium">
                        <p>
                            {metatag?.name}
                        </p>
                        <div className="flex flex-row justify-between">
                            <p className="text-sm mt-4 text-neutral-500 font-normal">
                                {t("article.total$count", { count: metatag?.feeds?.length })}
                            </p>
                        </div>
                    </div>
                    <Waiting for={status === "idle"}>
                        <div className="wauto flex flex-col">
                            {metatag?.feeds?.map(({ id, alias, ...feed }: any) => (
                                <FeedCard key={id} id={id} alias={alias} {...feed} />
                            ))}
                        </div>
                    </Waiting>
                </main>
            </Waiting>
        </>
    );
}
