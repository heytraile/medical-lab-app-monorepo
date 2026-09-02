import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.module";
import {
  CATALOG_CATEGORIES,
  CATALOG_VERSION,
  DRAX_HALL_LAB,
  DHMS_CATALOG_ITEMS,
  DHMS_PANELS,
  buildPanelsWithMembers,
  type CatalogItemSeed,
} from "@drax-lis/catalog";
import type { CatalogResponse } from "@drax-lis/contracts";

@Injectable()
export class CatalogService implements OnModuleInit {
  private readonly logger = new Logger(CatalogService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async onModuleInit() {
    if (this.supabase.enabled && this.supabase.client) {
      await this.ensureSeeded();
    }
  }

  async getCatalog(): Promise<CatalogResponse> {
    if (this.supabase.enabled && this.supabase.client) {
      await this.ensureSeeded();
      return this.fetchFromDb(DRAX_HALL_LAB.id);
    }
    return this.memoryCatalog();
  }

  private memoryCatalog(): CatalogResponse {
    const panels = buildPanelsWithMembers();
    return {
      labId: DRAX_HALL_LAB.id,
      labName: DRAX_HALL_LAB.name,
      categories: [...CATALOG_CATEGORIES],
      items: DHMS_CATALOG_ITEMS.map((i) => ({
        code: i.code,
        name: i.name,
        category: i.category,
        specimenHint: i.specimenHint ?? null,
        fastingRequired: i.fastingRequired ?? false,
      })),
      panels: panels.map((p) => ({
        code: p.code,
        name: p.name,
        description: p.description ?? null,
        memberCodes: p.memberCodes,
        members: p.members.map((m) => ({
          code: m.code,
          name: m.name,
          category: m.category,
          specimenHint: m.specimenHint ?? null,
          fastingRequired: m.fastingRequired ?? false,
        })),
      })),
    };
  }

  private async ensureSeeded() {
    const client = this.supabase.client!;

    const { count: labCount } = await client
      .from("labs")
      .select("id", { count: "exact", head: true });

    if ((labCount ?? 0) === 0) {
      await client.from("labs").insert({
        id: DRAX_HALL_LAB.id,
        code: DRAX_HALL_LAB.code,
        name: DRAX_HALL_LAB.name,
        settings: { catalog_version: 0 },
      });
    }

    const { data: labRow } = await client
      .from("labs")
      .select("settings")
      .eq("id", DRAX_HALL_LAB.id)
      .maybeSingle();

    const settings =
      (labRow as { settings?: { catalog_version?: number } } | null)
        ?.settings ?? {};
    const storedVersion = settings.catalog_version ?? 0;

    const { count: itemCount } = await client
      .from("test_catalog_items")
      .select("id", { count: "exact", head: true })
      .eq("lab_id", DRAX_HALL_LAB.id)
      .eq("active", true);

    const needsSync =
      storedVersion !== CATALOG_VERSION ||
      (itemCount ?? 0) < DHMS_CATALOG_ITEMS.length;

    if (!needsSync) return;

    this.logger.log(
      `Syncing DHMS catalog v${CATALOG_VERSION} (was v${storedVersion}, ${itemCount ?? 0} items)…`,
    );
    await this.syncCatalogSeed();
    await client
      .from("labs")
      .update({
        settings: { ...settings, catalog_version: CATALOG_VERSION },
      })
      .eq("id", DRAX_HALL_LAB.id);

    await client
      .from("profiles")
      .update({ lab_id: DRAX_HALL_LAB.id })
      .is("lab_id", null);

    this.logger.log("DHMS catalog sync complete");
  }

  private async syncCatalogSeed() {
    const client = this.supabase.client!;
    const seedCodes = new Set(DHMS_CATALOG_ITEMS.map((i) => i.code));

    const { error: itemErr } = await client.from("test_catalog_items").upsert(
      DHMS_CATALOG_ITEMS.map((item, idx) => ({
        ...catalogRow(item, idx),
        active: true,
      })),
      { onConflict: "lab_id,code" },
    );
    if (itemErr) throw itemErr;

    const { data: existingItems, error: listErr } = await client
      .from("test_catalog_items")
      .select("id, code")
      .eq("lab_id", DRAX_HALL_LAB.id);
    if (listErr) throw listErr;

    const staleIds = (existingItems ?? [])
      .filter((row) => !seedCodes.has(String((row as { code: string }).code)))
      .map((row) => String((row as { id: string }).id));

    if (staleIds.length) {
      const { error: deactivateErr } = await client
        .from("test_catalog_items")
        .update({ active: false })
        .in("id", staleIds);
      if (deactivateErr) throw deactivateErr;
    }

    const { data: allItems, error: allItemsErr } = await client
      .from("test_catalog_items")
      .select("id, code")
      .eq("lab_id", DRAX_HALL_LAB.id)
      .eq("active", true);
    if (allItemsErr) throw allItemsErr;

    const itemIdByCode = new Map(
      (allItems ?? []).map((r) => [
        String((r as { code: string }).code),
        String((r as { id: string }).id),
      ]),
    );

    const { data: existingPanels, error: panelsListErr } = await client
      .from("test_panels")
      .select("id, code")
      .eq("lab_id", DRAX_HALL_LAB.id);
    if (panelsListErr) throw panelsListErr;

    const panelIdByCode = new Map(
      (existingPanels ?? []).map((r) => [
        String((r as { code: string }).code),
        String((r as { id: string }).id),
      ]),
    );

    const seedPanelCodes = new Set(DHMS_PANELS.map((p) => p.code));

    for (const panel of DHMS_PANELS) {
      let panelId = panelIdByCode.get(panel.code);
      if (panelId) {
        const { error: updateErr } = await client
          .from("test_panels")
          .update({
            name: panel.name,
            description: panel.description ?? null,
            sort_order: panel.sortOrder ?? 0,
            active: true,
          })
          .eq("id", panelId);
        if (updateErr) throw updateErr;
      } else {
        const { data: panelRow, error: panelErr } = await client
          .from("test_panels")
          .insert({
            lab_id: DRAX_HALL_LAB.id,
            code: panel.code,
            name: panel.name,
            description: panel.description ?? null,
            sort_order: panel.sortOrder ?? 0,
            active: true,
          })
          .select("id")
          .single();
        if (panelErr) throw panelErr;
        panelId = String((panelRow as { id: string }).id);
        panelIdByCode.set(panel.code, panelId);
      }

      const { error: delMembersErr } = await client
        .from("test_panel_members")
        .delete()
        .eq("panel_id", panelId);
      if (delMembersErr) throw delMembersErr;

      const members = panel.memberCodes
        .map((code, sortOrder) => {
          const catalogItemId = itemIdByCode.get(code);
          if (!catalogItemId) {
            this.logger.warn(
              `Panel ${panel.code}: missing catalog item ${code}`,
            );
            return null;
          }
          return {
            panel_id: panelId!,
            catalog_item_id: catalogItemId,
            sort_order: sortOrder,
          };
        })
        .filter(
          (row): row is {
            panel_id: string;
            catalog_item_id: string;
            sort_order: number;
          } => row !== null,
        );

      if (members.length) {
        const { error: memErr } = await client
          .from("test_panel_members")
          .insert(members);
        if (memErr) throw memErr;
      }
    }

    const stalePanelIds = (existingPanels ?? [])
      .filter((row) => !seedPanelCodes.has(String((row as { code: string }).code)))
      .map((row) => String((row as { id: string }).id));

    if (stalePanelIds.length) {
      const { error: deactivatePanelsErr } = await client
        .from("test_panels")
        .update({ active: false })
        .in("id", stalePanelIds);
      if (deactivatePanelsErr) throw deactivatePanelsErr;
    }
  }

  private async fetchFromDb(labId: string): Promise<CatalogResponse> {
    const client = this.supabase.client!;
    const [{ data: lab }, { data: items }, { data: panels }] = await Promise.all([
      client.from("labs").select("id, name").eq("id", labId).single(),
      client
        .from("test_catalog_items")
        .select("code, name, category, specimen_hint, fasting_required")
        .eq("lab_id", labId)
        .eq("active", true)
        .order("sort_order"),
      client
        .from("test_panels")
        .select("id, code, name, description, sort_order")
        .eq("lab_id", labId)
        .eq("active", true)
        .order("sort_order"),
    ]);

    const panelIds = (panels ?? []).map((p) => (p as { id: string }).id);
    const membersByPanel = new Map<
      string,
      Array<{ code: string; name: string; category: string; specimen_hint: string | null; fasting_required: boolean }>
    >();
    if (panelIds.length) {
      const { data: members } = await client
        .from("test_panel_members")
        .select(
          "panel_id, sort_order, test_catalog_items (code, name, category, specimen_hint, fasting_required)",
        )
        .in("panel_id", panelIds)
        .order("sort_order");
      for (const m of members ?? []) {
        const row = m as {
          panel_id: string;
          test_catalog_items:
            | {
                code: string;
                name: string;
                category: string;
                specimen_hint: string | null;
                fasting_required: boolean;
              }
            | {
                code: string;
                name: string;
                category: string;
                specimen_hint: string | null;
                fasting_required: boolean;
              }[]
            | null;
        };
        const pid = row.panel_id;
        const raw = row.test_catalog_items;
        const item = Array.isArray(raw) ? raw[0] : raw;
        if (!item) continue;
        const list = membersByPanel.get(pid) ?? [];
        list.push(item);
        membersByPanel.set(pid, list);
      }
    }

    return {
      labId,
      labName: (lab as { name: string })?.name ?? DRAX_HALL_LAB.name,
      categories: [...CATALOG_CATEGORIES],
      items: (items ?? []).map((i) => ({
        code: (i as { code: string }).code,
        name: (i as { name: string }).name,
        category: (i as { category: string }).category,
        specimenHint: (i as { specimen_hint: string | null }).specimen_hint,
        fastingRequired: (i as { fasting_required: boolean }).fasting_required,
      })),
      panels: (panels ?? []).map((p) => {
        const memberRows =
          membersByPanel.get((p as { id: string }).id) ?? [];
        return {
          code: (p as { code: string }).code,
          name: (p as { name: string }).name,
          description: (p as { description: string | null }).description,
          memberCodes: memberRows.map((i) => i.code),
          members: memberRows.map((i) => ({
            code: i.code,
            name: i.name,
            category: i.category,
            specimenHint: i.specimen_hint,
            fastingRequired: i.fasting_required,
          })),
        };
      }),
    };
  }
}

function catalogRow(item: CatalogItemSeed, idx: number) {
  return {
    lab_id: DRAX_HALL_LAB.id,
    code: item.code,
    name: item.name,
    category: item.category,
    specimen_hint: item.specimenHint ?? null,
    fasting_required: item.fastingRequired ?? false,
    sort_order: item.sortOrder ?? idx,
  };
}
