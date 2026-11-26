// Admin → Promo Studio: make ads that promote CreatorFlow itself. Admin-only (route guard +
// requireAdmin on every server fn).
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateTab } from "./CreateTab";
import { LibraryTab } from "./LibraryTab";
import { BrandKitTab } from "./BrandKitTab";
import { BudgetWidget } from "./BudgetWidget";

export default function PromoStudioPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            to="/admin"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Admin
          </Link>
          <h1 className="mt-2 text-2xl font-bold">Promo Studio</h1>
          <p className="text-sm text-muted-foreground">
            Ads for promoting CreatorFlow AI. No user credits are used; AI cost is tracked per
            creative.
          </p>
        </div>
        <BudgetWidget />
      </div>
      <Tabs defaultValue="create">
        <TabsList>
          <TabsTrigger value="create">Create</TabsTrigger>
          <TabsTrigger value="library">Library</TabsTrigger>
          <TabsTrigger value="brand">Brand Kit</TabsTrigger>
        </TabsList>
        <TabsContent value="create" className="mt-6">
          <CreateTab />
        </TabsContent>
        <TabsContent value="library" className="mt-6">
          <LibraryTab />
        </TabsContent>
        <TabsContent value="brand" className="mt-6">
          <BrandKitTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
