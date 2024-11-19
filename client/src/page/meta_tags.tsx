import { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Waiting } from "../components/loading";
import { MetaTag } from "../components/meta";
import { client } from "../main";
import { siteName } from "../utils/constants";

type Metatag = {
    id: number;
    name: string;
    alias: string | null; // Changed from string | undefined
    type: string;
    description: string | null; // Changed from string | undefined
    parent: number | null; // Changed from string | undefined
    createdAt: Date;
    updatedAt: Date;
    feeds: number;
};

export function MetaTagsPage() {
    const { t } = useTranslation();
    const [metatags, setMetatags] = useState<Metatag[]>();
    const ref = useRef(false);
    useEffect(() => {
        if (ref.current) return;
        client.meta.index.get({
            query: {
                type: "tag",
            },
        }).then(({ data }) => {
            if (data && typeof data !== "string") {
                setMetatags(data);
            }
        });
        ref.current = true;
    }, []);
    return (
        <>
            <Helmet>
                <title>{`${t("tags")} - ${process.env.NAME}`}</title>
                <meta property="og:site_name" content={siteName} />
                <meta property="og:title" content={t("tags")} />
                <meta property="og:image" content={process.env.AVATAR} />
                <meta property="og:type" content="article" />
                <meta property="og:url" content={document.URL} />
            </Helmet>
            <Waiting for={metatags}>
                <main className="w-full flex flex-col justify-center items-center mb-8 ani-show">
                    <div className="wauto text-start text-black dark:text-white py-4 text-4xl font-medium">
                        <p>
                            {t("tags")}
                        </p>
                    </div>

                    <div className="wauto flex flex-col flex-wrap items-start justify-start">
                        {metatags?.filter(({ feeds }) => feeds > 0).map((metatag, index) => {
                            return (
                                <div key={index} className="w-full flex flex-row">
                                    <div className="w-full rounded-2xl m-2 duration-300 flex flex-row items-center space-x-4   ">
                                        <Link
                                            href={`/tags/${metatag.name}`}
                                            className="text-base t-primary hover:text-theme text-pretty overflow-hidden"
                                        >
                                            <MetaTag name={metatag.name} />
                                        </Link>
                                        <div className="flex-1" />
                                        <span className="t-secondary text-sm">
                                            {t("article.total_short$count", { count: metatag.feeds })}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </main>
            </Waiting>
        </>
    );
}
