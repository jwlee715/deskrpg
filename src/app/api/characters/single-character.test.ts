import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { seedUser, setupThrowawaySqlite } from "@/test-setup/npc-seed";
import { QUICK_START_APPEARANCE } from "@/lib/quick-start";

setupThrowawaySqlite("single-character");

// Use the appearance quick start uses — an office look that passes validateOfficeAppearance.
const APPEARANCE = QUICK_START_APPEARANCE;

function req(url: string, userId: string, method = "GET", body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "x-user-id": userId, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("without my character, me is null; once created, it is me", async () => {
  const user = await seedUser("solo");
  const { GET: ME } = await import("./me/route");
  const { POST } = await import("./route");
  let res = await ME(req("http://localhost/api/characters/me", user.id));
  assert.deepEqual((await res.json()).character, null);
  res = await POST(
    req("http://localhost/api/characters", user.id, "POST", { name: "나", appearance: APPEARANCE }),
  );
  assert.equal(res.status, 201);
  res = await ME(req("http://localhost/api/characters/me", user.id));
  assert.equal((await res.json()).character.name, "나");
});

test("if one already exists, a second is not created — 409", async () => {
  const user = await seedUser("dup");
  const { POST } = await import("./route");
  await POST(
    req("http://localhost/api/characters", user.id, "POST", { name: "나", appearance: APPEARANCE }),
  );
  const res = await POST(
    req("http://localhost/api/characters", user.id, "POST", { name: "둘", appearance: APPEARANCE }),
  );
  assert.equal(res.status, 409);
  assert.equal((await res.json()).errorCode, "character_already_exists");
});

test("PATCH saves 3,000 bio characters and rejects 3,001 without changing the saved bio", async () => {
  const user = await seedUser("bio");
  const { POST } = await import("./route");
  const { PATCH } = await import("./[id]/route");
  const created = await (
    await POST(
      req("http://localhost/api/characters", user.id, "POST", {
        name: "나",
        appearance: APPEARANCE,
      }),
    )
  ).json();
  const id = created.character.id as string;
  const ok = await PATCH(
    req(`http://localhost/api/characters/${id}`, user.id, "PATCH", {
      bio: "가".repeat(3000),
    }),
    { params: Promise.resolve({ id }) },
  );
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).character.bio, "가".repeat(3000));
  const long = await PATCH(
    req(`http://localhost/api/characters/${id}`, user.id, "PATCH", { bio: "가".repeat(3001) }),
    { params: Promise.resolve({ id }) },
  );
  assert.equal(long.status, 400);
  assert.equal((await long.json()).errorCode, "character_bio_too_long");
  const { GET: ME } = await import("./me/route");
  const saved = await ME(req("http://localhost/api/characters/me", user.id));
  assert.equal((await saved.json()).character.bio, "가".repeat(3000));
});

test("POST rejects 3,001 bio characters and accepts 3,000", async () => {
  const user = await seedUser("bio-create");
  const { POST } = await import("./route");
  const create = (bio: string) =>
    POST(
      req("http://localhost/api/characters", user.id, "POST", {
        name: "나",
        appearance: APPEARANCE,
        bio,
      }),
    );
  const rejected = await create("가".repeat(3001));
  assert.equal(rejected.status, 400);
  assert.equal((await rejected.json()).errorCode, "character_bio_too_long");
  const accepted = await create("가".repeat(3000));
  assert.equal(accepted.status, 201);
  assert.equal((await accepted.json()).character.bio, "가".repeat(3000));
});
