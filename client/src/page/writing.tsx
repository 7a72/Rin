import Editor from '@monaco-editor/react';
import i18n from 'i18next';
import _ from 'lodash';
import { editor } from 'monaco-editor';
import { Calendar } from 'primereact/calendar';
import 'primereact/resources/primereact.css';
import 'primereact/resources/themes/lara-light-indigo/theme.css';
import React, { useEffect, useRef, useState, useCallback } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import Loading from 'react-loading';
import { ShowAlertType, useAlert } from '../components/dialog';
import { Checkbox, Input } from "../components/input";
import { Markdown } from "../components/markdown";
import { client } from "../main";
import { headersWithAuth } from "../utils/auth";
import { Cache, useCache } from '../utils/cache';
import { siteName } from "../utils/constants";
import { useColorMode } from "../utils/darkModeUtils";
import mermaid from 'mermaid';

async function publish({
  title,
  alias,
  content,
  summary,
  tags,
  status,
  createdAt,
  allowComment,
  onCompleted,
  showAlert
}: {
  title: string;
  content: string;
  summary: string;
  tags: string[];
  status: string;
  alias?: string;
  createdAt?: Date;
  allowComment: boolean;
  onCompleted?: () => void;
  showAlert: ShowAlertType;
}) {
  const t = i18n.t;
  const { data, error } = await client.feed.index.post(
    {
      title,
      alias,
      content,
      summary,
      tags,
      status,
      createdAt,
      allowComment,
    },
    {
      headers: headersWithAuth(),
    }
  );
  if (onCompleted) {
    onCompleted();
  }
  if (error) {
    showAlert(error.value as string);
  }
  if (data && typeof data !== "string") {
    showAlert(t("publish.success"), () => {
      Cache.with().clear();
      window.location.href = "/posts/" + data.insertedId;
    });
  }
}

async function update({
  id,
  title,
  alias,
  content,
  summary,
  tags,
  status,
  createdAt,
  allowComment,
  onCompleted,
  showAlert
}: {
  id: number;
  title?: string;
  alias?: string;
  content?: string;
  summary?: string;
  tags?: string[];
  status: string;
  createdAt?: Date;
  allowComment: boolean;
  onCompleted?: () => void;
  showAlert: ShowAlertType;
}) {
  const t = i18n.t;
  const { error } = await client.feed({ id }).post(
    {
      title,
      alias,
      content,
      summary,
      tags,
      status,
      createdAt,
      allowComment,
    },
    {
      headers: headersWithAuth(),
    }
  );
  if (onCompleted) {
    onCompleted();
  }
  if (error) {
    showAlert(error.value as string);
  } else {
    showAlert(t("update.success"), () => {
      Cache.with(id).clear();
      window.location.href = "/posts/" + id;
    });
  }
}

function uploadImage(file: File, onSuccess: (url: string) => void, showAlert: ShowAlertType) {
  const t = i18n.t
  client.storage.index
    .post(
      {
        key: file.name,
        file: file,
      },
      {
        headers: headersWithAuth(),
      }
    )
    .then(({ data, error }) => {
      if (error) {
        showAlert(t("upload.failed", { error: error.value }));
      }
      if (data) {
        onSuccess(data);
      }
    })
    .catch((e: any) => {
      console.error(e);
      showAlert(t("upload.failed", { error: e.message }));
    });
}



// 写作页面
export function WritingPage({ id }: { id?: number }) {
  const { t } = useTranslation();
  const colorMode = useColorMode();
  const cache = Cache.with(id);
  const editorRef = useRef<editor.IStandaloneCodeEditor>();
  const [title, setTitle] = cache.useCache("title", "");
  const [summary, setSummary] = cache.useCache("summary", "");
  const [tags, setTags] = cache.useCache("tags", "");
  const [alias, setAlias] = cache.useCache("alias", "");
  const [status, setStatus] = useState<'publish' | 'draft' | 'private'>('publish');
  const [content, setContent] = cache.useCache("content", "");
  const [allowComment, setAllowComment] = useState(true);
  const [createdAt, setCreatedAt] = useState<Date | undefined>(new Date());
  const [preview, setPreview] = useCache<'edit' | 'preview' | 'comparison'>("preview", 'edit');
  const [uploading, setUploading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const { showAlert, AlertUI } = useAlert()
  function publishButton() {
    if (publishing) return;
    const tagsplit =
      tags
        .split("#")
        .filter((tag) => tag !== "")
        .map((tag) => tag.trim()) || [];
    if (id !== undefined) {
      setPublishing(true)
      update({
        id,
        title,
        content,
        summary,
        alias,
        tags: tagsplit,
        status,
        createdAt,
        allowComment,
        onCompleted: () => {
          setPublishing(false)
        },
        showAlert
      });
    } else {
      if (!title) {
        showAlert(t("title_empty"))
        return;
      }
      if (!content) {
        showAlert(t("content.empty"))
        return;
      }
      setPublishing(true)
      publish({
        title,
        content,
        summary,
        tags: tagsplit,
        status,
        alias,
        createdAt,
        allowComment,
        onCompleted: () => {
          setPublishing(false)
        },
        showAlert
      });
    }
  }


  const handlePaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    // Access the clipboard data using event.clipboardData
    const clipboardData = event.clipboardData;
    // only if clipboard payload is file
    if (clipboardData.files.length === 1) {
      const editor = editorRef.current;
      if (!editor) return;
      editor.trigger(undefined, "undo", undefined);
      setUploading(true)
      const myfile = clipboardData.files[0] as File;
      uploadImage(myfile, (url) => {
        const selection = editor.getSelection();
        if (!selection) return;
        editor.executeEdits(undefined, [{
          range: selection,
          text: `![${myfile.name}](${url})\n`,
        }]);
        setUploading(false)
      }, showAlert);
    }
  };

  function UploadImageButton() {
    const { showAlert, AlertUI } = useAlert();
    const uploadRef = useRef<HTMLInputElement>(null);
    const t = i18n.t
    const upChange = (event: any) => {
      for (let i = 0; i < event.currentTarget.files.length; i++) {
        const file = event.currentTarget.files[i]; ///获得input的第一个图片
        if (file.size > 5 * 1024000) {
          showAlert(t("upload.failed$size", { size: 5 }))
          uploadRef.current!.value = "";
        } else {
          const editor = editorRef.current;
          if (!editor) return;
          const selection = editor.getSelection();
          if (!selection) return;
          setUploading(true)
          uploadImage(file, (url) => {
            setUploading(false)
            editor.executeEdits(undefined, [{
              range: selection,
              text: `![${file.name}](${url})\n`,
            }]);
          }, showAlert);
        }
      }
    };
    return (
      <button onClick={() => uploadRef.current?.click()}>
        <input
          ref={uploadRef}
          onChange={upChange}
          className="hidden"
          type="file"
          accept="image/gif,image/jpeg,image/jpg,image/png"
        />
        <i className="ri-image-add-line" />
        <AlertUI />
      </button>
    )
  }
  useEffect(() => {
    if (id) {
      client
        .feed({ id })
        .get({
          headers: headersWithAuth(),
        })
        .then(({ data }) => {
          if (data && typeof data !== "string") {
            if (title == "" && data.title) setTitle(data.title);
            if (tags == "" && data.hashtags) setTags(data.hashtags.map(({ name }) => `#${name}`).join(" "));
            if (alias == "" && data.alias) setAlias(data.alias);
            if (content == "") setContent(data.content);
            if (summary == "") setSummary(data.summary);
            if (status === "publish") setStatus(data.status as "publish" | "draft" | "private" || "publish")
            setAllowComment(data.allowComment === 1 );
            setCreatedAt(new Date(data.createdAt));
          }
        });
    }
  }, []);
  const debouncedUpdate = useCallback(
    _.debounce(() => {
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
    }, 100),
    []
  );
  useEffect(() => {
    debouncedUpdate();
  }, [content, debouncedUpdate]);
  function MetaInput({ className }: { className?: string }) {
    return (
      <>
        <div className={className}>
          <Input
            id={id}
            value={title}
            setValue={setTitle}
            placeholder={t("title")}
          />
          <Input
            id={id}
            value={summary}
            setValue={setSummary}
            placeholder={t("summary")}
            className="mt-4"
          />
          <Input
            id={id}
            value={tags}
            setValue={setTags}
            placeholder={t("tags")}
            className="mt-4"
          />
          <Input
            id={id}
            value={alias}
            setValue={setAlias}
            placeholder={t("alias")}
            className="mt-4"
          />
          <div className="select-none flex flex-row justify-between items-center mt-6 mb-2 pl-4">
            <p>{t('status')}</p>
              <select value={status} onChange={(e) => setStatus(e.target.value as 'publish' | 'draft' | 'private')}>
              <option value="publish">{t('published')}</option>
              <option value="draft">{t('draft')}</option>
              <option value="private">{t('private')}</option>
            </select>
          </div>
          <div
            className="select-none flex flex-row justify-between items-center mt-6 mb-2 px-4"
            onClick={() => setAllowComment(!allowComment)}
          >
            <p>{t('allow_comment')}</p>
            <Checkbox
              id="allowComment"
              value={allowComment}
              setValue={setAllowComment}
              placeholder={t('allowComment')}
            />
          </div>
          <div className="select-none flex flex-row justify-between items-center mt-4 mb-2 pl-4">
            <p className="break-keep mr-2">
              {t('created_at')}
            </p>
            <Calendar value={createdAt} onChange={(e) => setCreatedAt(e.value || undefined)} showTime touchUI hourFormat="24" />
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Helmet>
        <title>{`${t('writing')} - ${process.env.NAME}`}</title>
        <meta property="og:site_name" content={siteName} />
        <meta property="og:title" content={t('writing')} />
        <meta property="og:image" content={process.env.AVATAR} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={document.URL} />
      </Helmet>
      <div className="grid grid-cols-1 md:grid-cols-3 t-primary mt-2">
        <div className="col-span-2 pb-8">
          <div className="bg-w rounded-2xl shadow-xl shadow-light p-4">
            {MetaInput({ className: "visible md:hidden mb-8" })}
            <div className="flex flex-col mx-4 my-2 md:mx-0 md:my-0 gap-2">
              <div className="flex flex-row space-x-2">
                <button className={`${preview === 'edit' ? "text-theme" : ""}`} onClick={() => setPreview('edit')}> {t("edit")} </button>
                <button className={`${preview === 'preview' ? "text-theme" : ""}`} onClick={() => setPreview('preview')}> {t("preview")} </button>
                <button className={`${preview === 'comparison' ? "text-theme" : ""}`} onClick={() => setPreview('comparison')}> {t("comparison")} </button>
                <div className="flex-grow" />
                {uploading &&
                  <div className="flex flex-row space-x-2 items-center">
                    <Loading type="spin" color="#FC466B" height={16} width={16} />
                    <span className="text-sm text-neutral-500">{t('uploading')}</span>
                  </div>
                }
              </div>
              <div className={`grid grid-cols-1 ${preview === 'comparison' ? "sm:grid-cols-2" : ""}`}>
                <div className={"flex flex-col " + (preview === 'preview' ? "hidden" : "")}>
                  <div className="flex flex-row justify-start mb-2">
                    <UploadImageButton />
                  </div>
                  <div
                    className={"relative"}
                    onDrop={(e) => {
                      e.preventDefault();
                      const editor = editorRef.current;
                      if (!editor) return;
                      for (let i = 0; i < e.dataTransfer.files.length; i++) {
                        const selection = editor.getSelection();
                        if (!selection) return;
                        const file = e.dataTransfer.files[i];
                        setUploading(true)
                        uploadImage(file, (url) => {
                          setUploading(false)
                          editor.executeEdits(undefined, [{
                            range: selection,
                            text: `![${file.name}](${url})\n`,
                          }]);
                        }, showAlert);
                      }
                    }}
                    onPaste={handlePaste}
                  >
                    <Editor
                      onMount={(editor, _) => {
                        editorRef.current = editor
                      }}
                      height="600px"
                      defaultLanguage="markdown"
                      className=""
                      value={content}
                      // onPaste={handlePaste}
                      onChange={(data, _) => {
                        cache.set("content", data ?? "");
                        setContent(data ?? "");
                      }}
                      theme={colorMode === "dark" ? "vs-dark" : "light"}
                      options={{
                        wordWrap: "on",
                        fontSize: 14,
                        fontFamily: "Fira Code",
                        lineNumbers: "off",
                        dragAndDrop: true,
                        pasteAs: { enabled: false }
                      }}
                    />
                  </div>
                </div>
                <div
                  className={"px-4 h-[600px] overflow-y-scroll " + (preview !== 'edit' ? "" : "hidden")}
                >
                  <Markdown content={content ? content : "> No content now. Write on the left side."} />
                </div>
              </div>
            </div>
          </div>
          <div className="visible md:hidden flex flex-row justify-center mt-8">
            <button
              onClick={publishButton}
              className="basis-1/2 bg-theme text-white py-4 rounded-full shadow-xl shadow-light flex flex-row justify-center items-center space-x-2"
            >
              {publishing &&
                <Loading type="spin" height={16} width={16} />
              }
              <span>
                {t('publish.title')}
              </span>
            </button>
          </div>
        </div>
        <div className="hidden md:visible max-w-96 md:flex flex-col">
          {MetaInput({ className: "bg-w rounded-2xl shadow-xl shadow-light p-4 mx-8" })}
          <div className="flex flex-row justify-center mt-8">
            <button
              onClick={publishButton}
              className="basis-1/2 bg-theme text-white py-4 rounded-full shadow-xl shadow-light flex flex-row justify-center items-center space-x-2"
            >
              {publishing &&
                <Loading type="spin" height={16} width={16} />
              }
              <span>
                {t('publish.title')}
              </span>
            </button>
          </div>
        </div>
      </div>
      <AlertUI />
    </>

  );
}

