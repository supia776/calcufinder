// netlify/functions/notion-blog.js

const NOTION_SECRET = process.env.NOTION_SECRET;
const DB_ID = process.env.NOTION_DATABASE_ID;

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

async function notionRequest(path, body) {
  const res = await fetch(`${NOTION_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${NOTION_SECRET}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Notion error:", res.status, text);
    throw new Error("Failed to call Notion API");
  }
  return res.json();
}

// 목록용 변환
function pageToListItem(page) {
  const props = page.properties;

  const title =
    props.Title?.title?.map(t => t.plain_text).join("") || "(no title)";

  const slug =
    props.Slug?.rich_text?.map(t => t.plain_text).join("") || "";

  const tags =
    (props.Tag || props.Tags)?.multi_select?.map(t => t.name) || [];

  const coverImage =
    props["Cover image"]?.files?.[0]?.file?.url || null;

  const contentPreview =
    props.Content?.rich_text?.[0]?.plain_text?.slice(0, 160) || "";

  return {
    id: page.id,
    slug,
    title,
    tags,
    coverImage,
    preview: contentPreview,
    lastEdited: page.last_edited_time,
  };
}

// 상세용 변환
function pageToDetail(page) {
  const props = page.properties;

  const title =
    props.Title?.title?.map(t => t.plain_text).join("") || "(no title)";

  const slug =
    props.Slug?.rich_text?.map(t => t.plain_text).join("") || "";

  const tags =
    (props.Tag || props.Tags)?.multi_select?.map(t => t.name) || [];

  const coverImage =
    props["Cover image"]?.files?.[0]?.file?.url || null;

  const content =
    props.Content?.rich_text?.map(t => t.plain_text).join("\n") || "";

  return {
    id: page.id,
    slug,
    title,
    tags,
    coverImage,
    content,
    lastEdited: page.last_edited_time,
  };
}

exports.handler = async (event) => {
  try {
    const mode = event.queryStringParameters?.mode || "list";

    // 글 목록
    if (mode === "list") {
      const data = await notionRequest(`/databases/${DB_ID}/query`, {
        filter: {
          property: "Published",
          checkbox: { equals: true },
        },
        sorts: [
          {
            timestamp: "last_edited_time",
            direction: "descending",
          },
        ],
      });

      const items = data.results.map(pageToListItem);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(items),
      };
    }

    // 글 상세
    if (mode === "detail") {
      const slug = event.queryStringParameters?.slug || "";

      if (!slug) {
        return { statusCode: 400, body: "Missing slug" };
      }

      const data = await notionRequest(`/databases/${DB_ID}/query`, {
        filter: {
          and: [
            {
              property: "Published",
              checkbox: { equals: true },
            },
            {
              property: "Slug",
              rich_text: { equals: slug },
            },
          ],
        },
        page_size: 1,
      });

      if (!data.results.length) {
        return { statusCode: 404, body: "Post not found" };
      }

      const post = pageToDetail(data.results[0]);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(post),
      };
    }

    return { statusCode: 400, body: "Invalid mode" };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server error" };
  }
};