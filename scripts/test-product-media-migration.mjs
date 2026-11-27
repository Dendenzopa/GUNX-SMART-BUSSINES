import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261128143000_product_images_and_storage_access.sql", import.meta.url), "utf8");
const products = readFileSync(new URL("../src/components/ProductManagement.tsx", import.meta.url), "utf8");
const ownerDashboard = readFileSync(new URL("../src/components/OwnerBusinessDashboard.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const types = readFileSync(new URL("../src/domain/types.ts", import.meta.url), "utf8");

assert.match(migration, /ADD COLUMN IF NOT EXISTS image_url text/i);
assert.match(migration, /RETURNS TABLE\([\s\S]*?image_url text[\s\S]*?\)/i);
assert.match(migration, /public\.has_shop_role\(p_shop_id, ARRAY\['owner','cashier','stockkeeper'\]/);
assert.match(migration, /public\.has_shop_permission\(p_shop_id, 'products\.read'\)/);
assert.match(migration, /CASE WHEN v_can_view_cost THEN p\.cost_price ELSE NULL::numeric END/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_shop_products\(uuid\) TO authenticated/);

for (const policy of [
  "business_assets_product_images_select",
  "business_assets_product_images_insert",
  "business_assets_product_images_update",
]) {
  assert.ok(migration.includes(policy), `Missing Storage policy: ${policy}`);
}
assert.equal((migration.match(/bucket_id = 'business-assets'/g) ?? []).length, 4,
  "Product image policies must all be scoped to the existing business-assets bucket");
assert.match(migration, /\(storage\.foldername\(name\)\)\[2\] = \(SELECT auth\.uid\(\)\)::text/);
assert.match(migration, /\(storage\.foldername\(name\)\)\[3\] = 'products'/);
assert.match(migration, /public\.has_shop_permission\(\(\(storage\.foldername\(name\)\)\[1\]\)::uuid, 'products\.manage'\)/);
assert.match(migration, /BEGIN;[\s\S]*COMMIT;/);

assert.match(products, /requestCameraPermissionsAsync/);
assert.match(products, /launchCameraAsync/);
assert.match(products, /requestMediaLibraryPermissionsAsync/);
assert.match(products, /launchImageLibraryAsync/);
assert.match(products, /from\("business-assets"\)/);
assert.match(products, /upsert: true/);
assert.match(products, /5 \* 1024 \* 1024/);
assert.match(products, /image_url: publicUrl/);
assert.match(products, /p\.image_url \?\? null/);

assert.match(ownerDashboard, /from\("business-assets"\)/);
assert.doesNotMatch(ownerDashboard, /from\("shop-branding"\)/);
assert.match(ownerDashboard, /userResult\.user\.id \+ "\/branding\//);

assert.match(types, /imageUrl\?: string \| null/);
assert.ok((app.match(/imageUrl:p\.image_url\?\?null/g) ?? []).length >= 3,
  "All product loading paths must retain image_url in the product model");
assert.match(app, /p\.imageUrl\?<Image source=\{\{uri:p\.imageUrl\}\}/);
assert.match(app, /productThumb:/);
assert.match(app, /bottomIcon:\{fontSize:24/);
assert.match(app, /pageTitle:\{color:"#FFF",fontSize:26/);

console.log("Product camera/gallery, storage access, product photo rendering and premium UI checks passed.");
