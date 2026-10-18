"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";
import { Plus, Trash2, Edit2, Image as ImageIcon, Save, X, Search, CheckCircle2, XCircle, Tag, Utensils } from "lucide-react";
import { v4 as uuidv4 } from "uuid";

type MenuItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  original_price: number | null;
  image_url: string;
  section: string;
  is_available: boolean;
};

export default function MenuBuilder() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  // Form State
  const [formData, setFormData] = useState<Partial<MenuItem>>({});
  const [customCategory, setCustomCategory] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchMenu();
  }, []);

  const fetchMenu = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("menu").select("*");
    if (error) {
      console.error("Supabase menu fetch error:", error);
      toast.error("Failed to load menu");
    } else {
      const normalized = (data || []).map((item: any) => ({
        ...item,
        section: item.section || item.category || "General",
        image_url: item.image_url || item.image || "/menu/default-food.jpg"
      }));
      normalized.sort((a: any, b: any) => (a.section || '').localeCompare(b.section || ''));
      setItems(normalized);
    }
    setLoading(false);
  };

  // Extract unique categories
  const categories = Array.from(new Set(items.map((i) => i.section || "General"))).filter(Boolean);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    setUploading(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${uuidv4()}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('menu-images')
      .upload(fileName, file);

    if (error) {
      toast.error("Image upload failed");
      setUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('menu-images')
      .getPublicUrl(fileName);

    setFormData({ ...formData, image_url: publicUrl });
    setUploading(false);
    toast.success("Image uploaded!");
  };

  const handleSave = async () => {
    const finalSection = formData.section === "__NEW__" ? customCategory.trim() : formData.section;

    if (!formData.name || !formData.price || !finalSection) {
      toast.error("Name, Price, and Category are required!");
      return;
    }

    const payload = {
      ...formData,
      section: finalSection,
      is_available: formData.is_available ?? true,
    };

    try {
      if (editingId === "new") {
        const res = await fetch("/api/admin/menu", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "insert", data: payload })
        });
        if (!res.ok) throw new Error();
        toast.success("New dish added successfully!");
      } else {
        const res = await fetch("/api/admin/menu", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update", id: editingId, data: payload })
        });
        if (!res.ok) throw new Error();
        toast.success("Dish updated!");
      }
      
      setEditingId(null);
      setFormData({});
      setCustomCategory("");
      fetchMenu();
    } catch (e) {
      toast.error("Failed to save dish");
    }
  };

  const toggleAvailability = async (item: MenuItem) => {
    const newStatus = !item.is_available;
    // Optimistic update
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_available: newStatus } : i));

    try {
      const res = await fetch("/api/admin/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: item.id, data: { is_available: newStatus } })
      });
      if (!res.ok) throw new Error();
      toast.success(`${item.name} marked as ${newStatus ? 'Available' : 'Sold Out'}`);
    } catch (e) {
      toast.error("Failed to update status");
      fetchMenu(); // Revert
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;
    const res = await fetch("/api/admin/menu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id })
    });
    if (!res.ok) toast.error("Failed to delete item");
    else {
      toast.success("Item deleted!");
      fetchMenu();
    }
  };

  const openAddModal = (defaultCategory?: string) => {
    const selectedCat = defaultCategory || (activeCategory !== "ALL" ? activeCategory : categories[0] || "Starters");
    setFormData({
      is_available: true,
      section: selectedCat,
      price: undefined,
      name: "",
      description: "",
      original_price: null,
      image_url: "",
    });
    setCustomCategory("");
    setEditingId("new");
  };

  // Filtering
  const filteredItems = items.filter(i => {
    const matchesCategory = activeCategory === "ALL" || i.section === activeCategory;
    const matchesSearch = i.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (i.section && i.section.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  // Group items by category for structured layout
  const groupedCategories = (activeCategory === "ALL" ? categories : [activeCategory]).filter(Boolean);

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6 lg:p-10 font-sans w-full max-w-full overflow-x-hidden">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 flex items-center gap-2.5">
              <span className="p-1.5 sm:p-2 bg-amber-100 text-amber-800 rounded-xl text-lg sm:text-xl">📖</span> Menu & Categories
            </h1>
            <p className="text-gray-500 text-xs sm:text-sm mt-0.5">Manage dishes, prices, and In-Stock / Sold-Out status.</p>
          </div>
          <button 
            onClick={() => openAddModal()}
            className="w-full sm:w-auto bg-blue-600 text-white px-5 py-2.5 sm:py-3 rounded-xl font-bold hover:bg-blue-700 transition active:scale-95 flex items-center justify-center gap-2 shadow-sm text-sm"
          >
            <Plus size={18}/> Add New Dish
          </button>
        </div>

        {/* Search & Category Filter Tabs */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-8 space-y-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Search */}
            <div className="relative w-full md:w-80">
              <input
                type="text"
                placeholder="Search dish or category..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-4 pr-10 text-sm font-medium focus:outline-none focus:border-blue-500 focus:bg-white transition"
              />
            </div>

            <div className="text-sm text-gray-500 font-medium">
              Total <span className="font-bold text-gray-900">{items.length}</span> dishes across <span className="font-bold text-gray-900">{categories.length}</span> categories
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pt-2 pb-1 border-t border-gray-100">
            <button
              onClick={() => setActiveCategory("ALL")}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition whitespace-nowrap ${
                activeCategory === "ALL"
                  ? "bg-gray-900 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              All Items ({items.length})
            </button>
            {categories.map(cat => {
              const count = items.filter(i => i.section === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition whitespace-nowrap flex items-center gap-1.5 ${
                    activeCategory === cat
                      ? "bg-amber-600 text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  <span>{cat}</span>
                  <span className="opacity-75 text-[10px]">({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Add/Edit Modal */}
        {editingId && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
              <div className="bg-gray-900 text-white p-5 flex justify-between items-center">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Utensils size={20} className="text-amber-400"/>
                  {editingId === "new" ? "Add New Dish to Menu" : `Edit "${formData.name}"`}
                </h2>
                <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-white">
                  <X size={20}/>
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-4 flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Category Selector */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Category / Section</label>
                    <select
                      value={formData.section || ""}
                      onChange={e => setFormData({ ...formData, section: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-xl p-2.5 text-sm font-bold text-gray-800 focus:border-amber-500 outline-none"
                    >
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                      <option value="__NEW__">➕ Create New Category...</option>
                    </select>

                    {formData.section === "__NEW__" && (
                      <input
                        type="text"
                        placeholder="Type new category name (e.g. Sizzlers, Mocktails)..."
                        value={customCategory}
                        onChange={e => setCustomCategory(e.target.value)}
                        className="mt-2 w-full border-2 border-amber-300 bg-amber-50 rounded-xl p-2.5 text-sm font-bold text-gray-800 outline-none"
                        autoFocus
                      />
                    )}
                  </div>

                  {/* Name */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Dish Name</label>
                    <input
                      type="text"
                      className="w-full border-2 border-gray-200 rounded-xl p-2.5 text-sm font-bold text-gray-800 focus:border-amber-500 outline-none"
                      value={formData.name || ''}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      placeholder="e.g. Butter Chicken"
                    />
                  </div>

                  {/* Price */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Selling Price (₹)</label>
                    <input
                      type="number"
                      className="w-full border-2 border-gray-200 rounded-xl p-2.5 text-sm font-bold text-gray-800 focus:border-amber-500 outline-none"
                      value={formData.price ?? ''}
                      onChange={e => setFormData({...formData, price: parseFloat(e.target.value)})}
                      placeholder="e.g. 290"
                    />
                  </div>

                  {/* Original Price */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Original Price (₹) <span className="text-gray-400 font-normal lowercase">(optional for discount badge)</span>
                    </label>
                    <input
                      type="number"
                      className="w-full border-2 border-gray-200 rounded-xl p-2.5 text-sm font-medium text-gray-800 focus:border-amber-500 outline-none"
                      value={formData.original_price ?? ''}
                      onChange={e => setFormData({...formData, original_price: e.target.value ? parseFloat(e.target.value) : null})}
                      placeholder="e.g. 350"
                    />
                  </div>

                  {/* Availability */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Stock Availability</label>
                    <select
                      value={formData.is_available ? "true" : "false"}
                      onChange={e => setFormData({ ...formData, is_available: e.target.value === "true" })}
                      className="w-full border-2 border-gray-200 rounded-xl p-2.5 text-sm font-bold text-gray-800 outline-none"
                    >
                      <option value="true">🟢 In Stock (Available)</option>
                      <option value="false">🔴 Out of Stock (Sold Out)</option>
                    </select>
                  </div>

                  {/* Description */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Description (Optional)</label>
                    <textarea
                      rows={2}
                      className="w-full border-2 border-gray-200 rounded-xl p-2.5 text-sm text-gray-800 focus:border-amber-500 outline-none"
                      value={formData.description || ''}
                      onChange={e => setFormData({...formData, description: e.target.value})}
                      placeholder="e.g. Cooked in rich creamy tomato cashew gravy with authentic spices."
                    />
                  </div>

                  {/* Image */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Dish Image</label>
                    <div className="flex items-center gap-4">
                      {formData.image_url ? (
                        <img src={formData.image_url} alt="Preview" className="w-16 h-16 object-cover rounded-xl border-2 border-gray-200 shadow-sm" />
                      ) : (
                        <div className="w-16 h-16 bg-gray-100 border-2 border-dashed rounded-xl flex items-center justify-center text-gray-400">
                          <ImageIcon size={24}/>
                        </div>
                      )}
                      <div>
                        <label className="cursor-pointer inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-xl font-bold text-xs text-gray-700 transition">
                          {uploading ? "Uploading..." : "Upload Photo"}
                          <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
                        </label>
                        <p className="text-[11px] text-gray-400 mt-1">Square or horizontal photos look best.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gray-50 border-t flex justify-end gap-3">
                <button
                  onClick={() => setEditingId(null)}
                  className="px-5 py-2.5 text-gray-600 font-bold hover:bg-gray-200 rounded-xl text-sm transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="bg-green-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-green-700 transition active:scale-95 flex items-center gap-2 text-sm shadow-sm"
                >
                  <Save size={18}/> Save Dish
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Menu Listings by Category */}
        {loading ? (
          <div className="text-center py-24 font-bold text-gray-400">Loading Menu Catalog...</div>
        ) : filteredItems.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center text-gray-400 font-medium border border-gray-100 shadow-sm">
            No dishes found matching your search.
          </div>
        ) : (
          <div className="space-y-8">
            {groupedCategories.map(cat => {
              const catItems = filteredItems.filter(i => (i.section || "General") === cat);
              if (catItems.length === 0) return null;

              return (
                <div key={cat} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                  
                  {/* Category Header */}
                  <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      <span className="text-amber-400 font-black text-sm sm:text-lg">●</span>
                      <h2 className="text-sm sm:text-lg font-bold tracking-wide truncate">{cat}</h2>
                      <span className="bg-white/10 text-white/80 text-[10px] sm:text-xs px-2 py-0.5 rounded-full font-bold shrink-0">
                        {catItems.length} items
                      </span>
                    </div>

                    <button
                      onClick={() => openAddModal(cat)}
                      className="bg-amber-500 hover:bg-amber-600 text-gray-950 font-bold px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-lg text-[11px] sm:text-xs flex items-center gap-1 transition active:scale-95 shadow-sm shrink-0 whitespace-nowrap"
                    >
                      <Plus size={14}/> Add to {cat}
                    </button>
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-100">
                        <tr>
                          <th className="p-4 font-bold">Dish</th>
                          <th className="p-4 font-bold">Price</th>
                          <th className="p-4 font-bold text-center">Status</th>
                          <th className="p-4 font-bold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-sm">
                        {catItems.map(item => (
                          <tr key={item.id} className="hover:bg-gray-50/80 transition">
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                <img
                                  src={item.image_url || '/menu/default-food.jpg'}
                                  alt={item.name}
                                  className="w-12 h-12 rounded-xl object-cover border border-gray-100 shadow-sm shrink-0"
                                  onError={(e) => { (e.target as any).src = '/hotel-marquis.jpg'; }}
                                />
                                <div>
                                  <p className="font-bold text-gray-900">{item.name}</p>
                                  {item.description && (
                                    <p className="text-xs text-gray-400 line-clamp-1 max-w-sm mt-0.5">{item.description}</p>
                                  )}
                                </div>
                              </div>
                            </td>

                            <td className="p-4">
                              <div className="font-bold text-gray-900">₹{item.price}</div>
                              {item.original_price && (
                                <div className="text-xs text-gray-400 line-through">₹{item.original_price}</div>
                              )}
                            </td>

                            {/* Live Availability Toggle */}
                            <td className="p-4 text-center">
                              <button
                                onClick={() => toggleAvailability(item)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition active:scale-95 ${
                                  item.is_available
                                    ? "bg-green-100 text-green-700 hover:bg-green-200"
                                    : "bg-red-100 text-red-700 hover:bg-red-200"
                                }`}
                              >
                                {item.is_available ? (
                                  <>
                                    <CheckCircle2 size={14}/> In Stock
                                  </>
                                ) : (
                                  <>
                                    <XCircle size={14}/> Out of Stock
                                  </>
                                )}
                              </button>
                            </td>

                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => { setFormData(item); setEditingId(item.id); }}
                                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition"
                                  title="Edit Dish"
                                >
                                  <Edit2 size={16}/>
                                </button>
                                <button
                                  onClick={() => handleDelete(item.id, item.name)}
                                  className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition"
                                  title="Delete Dish"
                                >
                                  <Trash2 size={16}/>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards View (100% responsive on small phone screens) */}
                  <div className="block md:hidden divide-y divide-gray-100">
                    {catItems.map(item => (
                      <div key={item.id} className="p-3.5 flex items-center justify-between gap-3 hover:bg-gray-50/50 transition">
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={item.image_url || '/menu/default-food.jpg'}
                            alt={item.name}
                            className="w-14 h-14 rounded-xl object-cover border border-gray-100 shadow-sm shrink-0"
                            onError={(e) => { (e.target as any).src = '/hotel-marquis.jpg'; }}
                          />
                          <div className="min-w-0">
                            <h3 className="font-bold text-gray-900 text-sm truncate">{item.name}</h3>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-extrabold text-gray-900 text-sm">₹{item.price}</span>
                              {item.original_price && (
                                <span className="text-[11px] text-gray-400 line-through">₹{item.original_price}</span>
                              )}
                            </div>
                            <button
                              onClick={() => toggleAvailability(item)}
                              className={`mt-1 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold transition active:scale-95 ${
                                item.is_available
                                  ? "bg-green-100 text-green-700"
                                  : "bg-red-100 text-red-700"
                              }`}
                            >
                              {item.is_available ? "● In Stock" : "● Sold Out"}
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => { setFormData(item); setEditingId(item.id); }}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition"
                            title="Edit"
                          >
                            <Edit2 size={16}/>
                          </button>
                          <button
                            onClick={() => handleDelete(item.id, item.name)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition"
                            title="Delete"
                          >
                            <Trash2 size={16}/>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
