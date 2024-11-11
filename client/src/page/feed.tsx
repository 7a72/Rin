import { useContext, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import ReactModal from "react-modal";
import { Link, useLocation } from "wouter";
import { useAlert, useConfirm } from "../components/dialog";
import { HashTag } from "../components/hashtag";
import { Waiting } from "../components/loading";
import { Markdown } from "../components/markdown";
import { client } from "../main";
import { ClientConfigContext } from "../state/config";
import { ProfileContext } from "../state/profile";
import { headersWithAuth } from "../utils/auth";
import { siteName } from "../utils/constants";
import { timeago } from "../utils/timeago";
import { Button } from "../components/button";
import { Tips } from "../components/tips";
import mermaid from "mermaid";

type Feed = {
  id: number;
  title: string | null;
  content: string;
  uid: number;
  createdAt: Date;
  updatedAt: Date;
  hashtags: {
    id: number;
    name: string;
  }[];
  user: {
    avatar: string | null;
    id: number;
    username: string;
  };
  views: number;
  allowComment: number
};

export function FeedPage({ id, TOC, clean }: { id: string, TOC: () => JSX.Element, clean: (id: string) => void }) {
  const { t } = useTranslation();
  const profile = useContext(ProfileContext);
  const [feed, setFeed] = useState<Feed>();
  const [error, setError] = useState<string>();
  const [headImage, setHeadImage] = useState<string>();
  const ref = useRef("");
  const [_, setLocation] = useLocation();
  const { showAlert, AlertUI } = useAlert();
  const { showConfirm, ConfirmUI } = useConfirm();
  const [top, setTop] = useState<number>(0);
  const config = useContext(ClientConfigContext);
  const counterEnabled = config.get<boolean>('counter.enabled');
  function deleteFeed() {
    // Confirm
    showConfirm(
      t("article.delete.title"),
      t("article.delete.confirm"),
      () => {
        if (!feed) return;
        client
          .feed({ id: feed.id })
          .delete(null, {
            headers: headersWithAuth(),
          })
          .then(({ error }) => {
            if (error) {
              showAlert(error.value as string);
            } else {
              showAlert(t("delete.success"));
              setLocation("/");
            }
          });
      })
  }
  function topFeed() {
    const isUnTop = !(top > 0)
    const topNew = isUnTop ? 1 : 0;
    // Confirm
    showConfirm(
      isUnTop ? t("article.top.title") : t("article.untop.title"),
      isUnTop ? t("article.top.confirm") : t("article.untop.confirm"),
      () => {
        if (!feed) return;
        client
          .feed.top({ id: feed.id })
          .post({
            top: topNew,
          }, {
            headers: headersWithAuth(),
          })
          .then(({ error }) => {
            if (error) {
              showAlert(error.value as string);
            } else {
              showAlert(isUnTop ? t("article.top.success") : t("article.untop.success"));
              setTop(topNew);
            }
          });
      })
  }
  useEffect(() => {
    if (ref.current == id) return;
    setFeed(undefined);
    setError(undefined);
    setHeadImage(undefined);
    client
      .feed({ id })
      .get({
        headers: headersWithAuth(),
      })
      .then(({ data, error }) => {
        if (error) {
          setError(error.value as string);
        } else if (data && typeof data !== "string") {
          setTimeout(() => {
            setFeed(data);
            setTop(data.top);
            // Extract head image
            const img_reg = /!\[.*?\]\((.*?)\)/;
            const img_match = img_reg.exec(data.content);
            if (img_match) {
              setHeadImage(img_match[1]);
            }
            clean(id);
          }, 0);
        }
      });
    ref.current = id;
  }, [id]);
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "default",
    });
    mermaid.run({
      suppressErrors: true,
      nodes: document.querySelectorAll("pre.mermaid_default")
    }).then(()=>{
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
      });
      mermaid.run({
        suppressErrors: true,
        nodes: document.querySelectorAll("pre.mermaid_dark")
      });
    })
  }, [feed]);

  return (
    <Waiting for={feed || error}>
      {feed && (
        <Helmet>
          <title>{`${feed.title ?? "Unnamed"} - ${process.env.NAME}`}</title>
          <meta property="og:site_name" content={siteName} />
          <meta property="og:title" content={feed.title ?? ""} />
          <meta property="og:image" content={headImage ?? process.env.AVATAR} />
          <meta property="og:type" content="article" />
          <meta property="og:url" content={document.URL} />
          <meta
            name="og:description"
            content={
              feed.content.length > 200
                ? feed.content.substring(0, 200)
                : feed.content
            }
          />
          <meta name="author" content={feed.user.username} />
          <meta
            name="keywords"
            content={feed.hashtags.map(({ name }) => name).join(", ")}
          />
          <meta
            name="description"
            content={
              feed.content.length > 200
                ? feed.content.substring(0, 200)
                : feed.content
            }
          />
        </Helmet>
      )}
      <div className="w-full flex flex-row justify-center ani-show">
        {error && (
          <>
            <div className="flex flex-col wauto rounded-2xl bg-w m-2 p-6 items-center justify-center space-y-2">
              <h1 className="text-xl font-bold t-primary">{error}</h1>
              {error === "Not found" && id === "about" && (
                <Tips value={t("about.notfound")} />
              )}
              <Button
                title={t("index.back")}
                onClick={() => (window.location.href = "/")}
              />
            </div>
          </>
        )}
        {feed && !error && (
          <>
            <div className="xl:w-64" />
            <main className="wauto">
              <article
                className="rounded-2xl bg-w m-2 px-6 py-4"
                aria-label={feed.title ?? "Unnamed"}
              >
                <div className="flex justify-between">
                
                  <div>
                    <div className="flex flex-row items-center">
                      <h1 className="text-2xl font-bold t-primary break-all">
                        {feed.title}
                      </h1>
                      <div className="flex-1 w-0" />
                    </div>
                    <div className="mt-1 mb-1 flex gap-1">
                      <p
                        className="text-gray-400 text-[12px]"
                        title={new Date(feed.createdAt).toLocaleString()}
                      >
                        {t("feed_card.published$time", {
                          time: timeago(feed.createdAt),
                        })}
                      </p>

                      {feed.createdAt !== feed.updatedAt && (
                        <p
                          className="text-gray-400 text-[12px]"
                          title={new Date(feed.updatedAt).toLocaleString()}
                        >
                          {t("feed_card.updated$time", {
                            time: timeago(feed.updatedAt),
                          })}
                        </p>
                      )}
                    </div>
                    {counterEnabled && <p className='text-[12px] text-gray-400 font-normal link-line'>
                      <span> {t("views")} </span>
                      <span>
                        {feed.views}
                      </span>
                    </p>}
                  </div>
                  <div className="pt-2">
                    {profile?.permission && (
                      <div className="flex gap-2">
                        <button
                          aria-label={top > 0 ? t("untop.title") : t("top.title")}
                          onClick={topFeed}
                          className={`flex-1 flex flex-col items-end justify-center px-2 py rounded-full transition ${top > 0 ? "bg-theme text-white hover:bg-theme-hover active:bg-theme-active" : "bg-secondary bg-button dark:text-neutral-400"}`}
                        >
                          <i className="ri-skip-up-line" />
                        </button>
                        <Link
                          aria-label={t("edit")}
                          href={`/writing/${feed.id}`}
                          className="flex-1 flex flex-col items-end justify-center px-2 py bg-secondary bg-button rounded-full transition"
                        >
                          <i className="ri-edit-2-line dark:text-neutral-400" />
                        </Link>
                        <button
                          aria-label={t("delete.title")}
                          onClick={deleteFeed}
                          className="flex-1 flex flex-col items-end justify-center px-2 py bg-secondary bg-button rounded-full transition"
                        >
                          <i className="ri-delete-bin-7-line text-red-500" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <Markdown content={feed.content} />
                <div className="mt-6 flex flex-col gap-2">
                  {feed.hashtags.length > 0 && (
                    <div className="flex flex-row flex-wrap gap-x-2">
                      {feed.hashtags.map(({ name }, index) => (
                        <HashTag key={index} name={name} />
                      ))}
                    </div>
                  )}
                  <div className="flex flex-row items-center">
                    <img
                      src={feed.user.avatar || "/avatar.png"}
                      className="w-8 h-8 rounded-full"
                    />
                    <div className="ml-2">
                      <span className="text-gray-400 text-sm cursor-default">
                        {feed.user.username}
                      </span>
                    </div>
                  </div>
                </div>
              </article>
              {feed.allowComment === 1 && <TwikooComments envId={`${process.env.twikooEnvID}`} />}
              <div className="h-16" />
            </main>
            <div className="w-80 hidden lg:block relative">
              <div
                className={`ml-2 start-0 end-0 top-[5.5rem] sticky`}
              >
                <TOC />
              </div>
            </div>
          </>
        )}
      </div>
      <AlertUI />
      <ConfirmUI />
    </Waiting>
  );
}

export function TOCHeader({ TOC }: { TOC: () => JSX.Element }) {
  const [isOpened, setIsOpened] = useState(false);

  return (
    <div className="lg:hidden">
      <button
        onClick={() => setIsOpened(true)}
        className="w-10 h-10 rounded-full flex flex-row items-center justify-center"
      >
        <i className="ri-menu-2-fill t-primary ri-lg"></i>
      </button>
      <ReactModal
        isOpen={isOpened}
        style={{
          content: {
            top: "50%",
            left: "50%",
            right: "auto",
            bottom: "auto",
            marginRight: "-50%",
            transform: "translate(-50%, -50%)",
            padding: "0",
            border: "none",
            borderRadius: "16px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            background: "none",
          },
          overlay: {
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            zIndex: 1000,
          },
        }}
        onRequestClose={() => setIsOpened(false)}
      >
        <div className="w-[80vw] sm:w-[60vw] lg:w-[40vw] overflow-clip relative t-primary">
          <TOC />
        </div>
      </ReactModal>
    </div>
  );
}


function TwikooComments({ envId }: { envId: string }) {
  const [loaded, setLoaded] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadComments = () => {
    if (scriptLoaded) return;

    try {
      const twikooScript = document.createElement("script");
      twikooScript.src = "https://cdn.jsdelivr.net/npm/twikoo@1.6.39/dist/twikoo.min.js";
      twikooScript.defer = true;
      twikooScript.onload = () => {
        try {
          (window as any).twikoo.init({
            envId: envId,
            el: "#twikoo",
            path: window.location.pathname.replace(/\/$/, ""),
          });
          setScriptLoaded(true);
        } catch (initError) {
          setError("Failed to initialize comments.");
        }
      };

      twikooScript.onerror = () => {
        setError("Failed to load the Twikoo script.");
      };

      document.body.appendChild(twikooScript);
    } catch (e) {
      setError("An unexpected error occurred.");
    }
  };

  useEffect(() => {
    return () => {
      const script = document.querySelector('script[src="https://cdn.jsdelivr.net/npm/twikoo@1.6.39/dist/twikoo.min.js"]');
      if (script) {
        document.body.removeChild(script);
      }
    };
  }, []);

  return (
    <div className="flex flex-col w-auto rounded-2xl bg-w t-primary m-2 p-6 items-center justify-center">
      {!loaded ? (
        <button
          onClick={() => {
            loadComments();
            setLoaded(true);
          }}
          className="mt-4 bg-theme text-white px-4 py-2 rounded-full w-full"
        >
          加载评论
        </button>
      ) : (
        <div id="twikoo" className="m-2 w-full"></div>
      )}
      {error && <p className="text-red-500 mt-4">{error}</p>}
    </div>
  );
}


