import { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Waiting } from "../components/loading";
import { MetaCategory } from "../components/meta";
import { client } from "../main";
import { siteName } from "../utils/constants";

type Metacategory = {
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

export function MetaCategoriesPage() {
    const { t } = useTranslation();
    const [metacategories, setmetacategories] = useState<Metacategory[]>();
    const ref = useRef(false);
    useEffect(() => {
        if (ref.current) return;
        client.meta.index.get({
            query: {
                type: "category",
            },
        }).then(({ data }) => {
            if (data && typeof data !== "string") {
                setmetacategories(data);
            }
        });
        ref.current = true;
    }, []);
    return (
        <>
            <Helmet>
                <title>{`${t("categories")} - ${process.env.NAME}`}</title>
                <meta property="og:site_name" content={siteName} />
                <meta property="og:title" content={t("categories")} />
                <meta property="og:image" content={process.env.AVATAR} />
                <meta property="og:type" content="article" />
                <meta property="og:url" content={document.URL} />
            </Helmet>
            <Waiting for={metacategories}>
                <main className="w-full flex flex-col justify-center items-center mb-8 ani-show">
                    <div className="wauto text-start text-black dark:text-white py-4 text-4xl font-medium">
                        <p>
                            {t("categories")}
                        </p>
                    </div>

                    <div className="wauto flex flex-col flex-wrap items-start justify-start">
                        {metacategories?.filter(({ feeds }) => feeds > 0).map((metacategory, index) => {
                            return (
                                <div key={index} className="w-full flex flex-row">
                                    <div className="w-full rounded-2xl m-2 duration-300 flex flex-row items-center space-x-4   ">
                                        <Link
                                            href={`/categories/${metacategory.name}`}
                                            className="text-base t-primary hover:text-theme text-pretty overflow-hidden"
                                        >
                                            <MetaCategory name={metacategory.name} />
                                        </Link>
                                        <div className="flex-1" />
                                        <span className="t-secondary text-sm">
                                            {t("article.total_short$count", { count: metacategory.feeds })}
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
