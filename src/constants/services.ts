export interface Service {
  id: string;
  name: string;
  description?: string;
  price: string;
  priceValue: number;
  time: string;
  category: string;
}

export const servicesData: Service[] = [
  { id: "trial-1", name: "Razorpay Trial Service", price: "₹1", priceValue: 1, time: "5 min", category: "Add-ons" },
  // ADD-ONS
  { id: "ao-1", name: "Half Back Wax (Rica)", price: "₹1499", priceValue: 1499, time: "30 min", category: "Add-ons" },
  { id: "ao-2", name: "Half Back Wax (Honey)", price: "₹1999", priceValue: 1999, time: "30 min", category: "Add-ons" },
  { id: "ao-3", name: "Half Back Wax (Spray)", price: "₹2499", priceValue: 2499, time: "30 min", category: "Add-ons" },
  { id: "ao-4", name: "Face Wax (Honey)", price: "₹399", priceValue: 399, time: "20 min", category: "Add-ons" },
  { id: "ao-5", name: "Face Wax (Rica)", price: "₹999", priceValue: 999, time: "20 min", category: "Add-ons" },
  { id: "ao-6", name: "Full Body Wax (Honey)", price: "₹2499", priceValue: 2499, time: "90 min", category: "Add-ons" },
  { id: "ao-7", name: "Full Body Wax (Rica)", price: "₹3499", priceValue: 3499, time: "90 min", category: "Add-ons" },
  { id: "ao-8", name: "Full Leg Wax (Honey)", price: "₹599", priceValue: 599, time: "30 min", category: "Add-ons" },
  { id: "ao-9", name: "Full Leg Wax (Rica)", price: "₹1199", priceValue: 1199, time: "30 min", category: "Add-ons" },
  { id: "ao-10", name: "Underarms Wax", price: "₹499", priceValue: 499, time: "15 min", category: "Add-ons" },
  { id: "ao-11", name: "Upper Lips Wax", price: "₹69", priceValue: 69, time: "10 min", category: "Add-ons" },
  { id: "ao-14", name: "Eye brow threading", price: "₹30", priceValue: 30, time: "10 min", category: "Add-ons" },
  { id: "ao-15", name: "Chin threading", price: "₹20", priceValue: 20, time: "10 min", category: "Add-ons" },
  { id: "ao-12-basic", name: "Face Scrub (Basic)", price: "₹249", priceValue: 249, time: "15 min", category: "Add-ons" },
  { id: "ao-12-advance", name: "Face Scrub (Advance)", price: "₹349", priceValue: 349, time: "15 min", category: "Add-ons" },
  { id: "ao-12-premium", name: "Face Scrub (Premium)", price: "₹499", priceValue: 499, time: "15 min", category: "Add-ons" },
  { id: "ao-13-basic", name: "Face Massage (Basic)", price: "₹249", priceValue: 249, time: "20 min", category: "Add-ons" },
  { id: "ao-13-advance", name: "Face Massage (Advance)", price: "₹349", priceValue: 349, time: "20 min", category: "Add-ons" },
  { id: "ao-13-premium", name: "Face Massage (Premium)", price: "₹499", priceValue: 499, time: "20 min", category: "Add-ons" },

  // BASIC BEAUTY SERVICES
  { id: "bb-1", name: "Anti-Aging Facial", price: "₹2499", priceValue: 2499, time: "60 min", category: "Basic Beauty" },
  { id: "bb-2", name: "Basic Mini Facial", price: "₹999", priceValue: 999, time: "45 min", category: "Basic Beauty" },
  { id: "bb-3", name: "Brightening Facial", price: "₹2499", priceValue: 2499, time: "60 min", category: "Basic Beauty" },
  { id: "bb-4", name: "Fruit Facial", price: "₹1999", priceValue: 1999, time: "60 min", category: "Basic Beauty" },
  { id: "bb-5", name: "Gold Facial", price: "₹2499", priceValue: 2499, time: "60 min", category: "Basic Beauty" },
  { id: "bb-6", name: "Green Tea Facial", price: "₹3499", priceValue: 3499, time: "60 min", category: "Basic Beauty" },
  { id: "bb-7-basic", name: "Herbal Facial (Basic)", price: "₹1999", priceValue: 1999, time: "60 min", category: "Basic Beauty" },
  { id: "bb-7-premium", name: "Herbal Facial (Premium)", price: "₹2999", priceValue: 2999, time: "60 min", category: "Basic Beauty" },
  { id: "bb-8", name: "Organic Facial", price: "₹2499", priceValue: 2499, time: "60 min", category: "Basic Beauty" },
  { id: "bb-9", name: "Pearl Facial", price: "₹2999", priceValue: 2999, time: "60 min", category: "Basic Beauty" },
  { id: "bb-10-basic", name: "O3 Facial (Basic)", price: "₹2499", priceValue: 2499, time: "90 min", category: "Basic Beauty" },
  { id: "bb-10-advance", name: "O3 Facial (Advance)", price: "₹3499", priceValue: 3499, time: "90 min", category: "Basic Beauty" },
  { id: "bb-10-premium", name: "O3 Facial (Premium)", price: "₹4499", priceValue: 4499, time: "90 min", category: "Basic Beauty" },
  { id: "bb-11", name: "Standard Facial", price: "₹2499", priceValue: 2499, time: "60 min", category: "Basic Beauty" },

  // CLEANUP SERVICES
  { id: "cl-1-basic", name: "Cleanup (Basic)", price: "₹649", priceValue: 649, time: "45 min", category: "Cleanup" },
  { id: "cl-1-standard", name: "Cleanup (Standard)", price: "₹849", priceValue: 849, time: "45 min", category: "Cleanup" },
  { id: "cl-1-advance", name: "Cleanup (Advance)", price: "₹949", priceValue: 949, time: "45 min", category: "Cleanup" },
  { id: "cl-1-premium", name: "Cleanup (Premium)", price: "₹1299", priceValue: 1299, time: "45 min", category: "Cleanup" },
  { id: "cl-1-ultra", name: "Cleanup (Ultra Premium)", price: "₹1499", priceValue: 1499, time: "45 min", category: "Cleanup" },
  { id: "cl-1-luxury", name: "Cleanup (Luxury)", price: "₹2499", priceValue: 2499, time: "45 min", category: "Cleanup" },
  { id: "cl-2", name: "Hydra Cleanup", price: "₹2499", priceValue: 2499, time: "60 min", category: "Cleanup" },
  { id: "cl-3-basic", name: "O3 Cleanup (Basic)", price: "₹1499", priceValue: 1499, time: "60 min", category: "Cleanup" },
  { id: "cl-3-premium", name: "O3 Cleanup (Premium)", price: "₹2499", priceValue: 2499, time: "60 min", category: "Cleanup" },
  { id: "cl-4", name: "Pure Organic Cleanup", price: "₹3999", priceValue: 3999, time: "60 min", category: "Cleanup" },
  { id: "cl-5", name: "Hydra Facial", price: "₹4999", priceValue: 4999, time: "90 min", category: "Cleanup" },

  // DETAN SERVICES
  { id: "dt-1-basic", name: "Face Detan (Basic)", price: "₹449", priceValue: 449, time: "20 min", category: "Detan" },
  { id: "dt-1-standard", name: "Face Detan (Standard)", price: "₹549", priceValue: 549, time: "20 min", category: "Detan" },
  { id: "dt-1-advance", name: "Face Detan (Advance)", price: "₹599", priceValue: 599, time: "20 min", category: "Detan" },
  { id: "dt-1-premium", name: "Face Detan (Premium)", price: "₹699", priceValue: 699, time: "20 min", category: "Detan" },
  { id: "dt-1-ultra", name: "Face Detan (Ultra Premium)", price: "₹899", priceValue: 899, time: "20 min", category: "Detan" },
  { id: "dt-2", name: "Full Body Detan", price: "₹2499", priceValue: 2499, time: "90 min", category: "Detan" },
  { id: "dt-3", name: "Full Hands Detan", price: "₹999", priceValue: 999, time: "30 min", category: "Detan" },
  { id: "dt-4", name: "Full Back Detan", price: "₹1499", priceValue: 1499, time: "30 min", category: "Detan" },
  { id: "dt-5", name: "Full Legs Detan", price: "₹999", priceValue: 999, time: "30 min", category: "Detan" },

  // HAIR CUT SERVICES
  { id: "hc-1", name: "Male: Haircut", price: "₹119", priceValue: 119, time: "30 min", category: "Hair Cut" },
  { id: "hc-2", name: "Male: Long Hair Cut", price: "₹199", priceValue: 199, time: "40 min", category: "Hair Cut" },
  { id: "hc-3", name: "Male: Wolf Cut", price: "₹299", priceValue: 299, time: "45 min", category: "Hair Cut" },
  { id: "hc-4", name: "Male: Senior Haircut", price: "₹299", priceValue: 299, time: "40 min", category: "Hair Cut" },
  { id: "hc-5-basic", name: "Female: Haircut (Basic)", price: "₹349", priceValue: 349, time: "60 min", category: "Hair Cut" },
  { id: "hc-5-advance", name: "Female: Haircut (Advance)", price: "₹499", priceValue: 499, time: "60 min", category: "Hair Cut" },
  { id: "hc-5-premium", name: "Female: Haircut (Premium)", price: "₹999", priceValue: 999, time: "60 min", category: "Hair Cut" },
  { id: "hc-6", name: "Female: Layer Cut", price: "₹499", priceValue: 499, time: "60 min", category: "Hair Cut" },
  { id: "hc-7", name: "Female: U Cut", price: "₹149", priceValue: 149, time: "30 min", category: "Hair Cut" },

  // HAIR STYLING
  { id: "hs-1", name: "Male: Styling (with wash)", price: "₹149", priceValue: 149, time: "30 min", category: "Hair Styling" },
  { id: "hs-2", name: "Female: Blow Dry", price: "₹499", priceValue: 499, time: "30 min", category: "Hair Styling" },
  { id: "hs-3-basic", name: "Female: Styling (Basic)", price: "₹499", priceValue: 499, time: "60 min", category: "Hair Styling" },
  { id: "hs-3-premium", name: "Female: Styling (Premium)", price: "₹999", priceValue: 999, time: "60 min", category: "Hair Styling" },
  { id: "hs-4", name: "Female: Wash + Blow Dry", price: "₹499", priceValue: 499, time: "45 min", category: "Hair Styling" },

  // HAIR WASH
  { id: "hw-1", name: "Male: Hair Wash", price: "₹49", priceValue: 49, time: "15 min", category: "Hair Wash" },
  { id: "hw-2", name: "Female: Hair Wash", price: "₹249", priceValue: 249, time: "20 min", category: "Hair Wash" },
  { id: "hw-3-basic", name: "Female: Regular Shampoo Wash (Basic)", price: "₹149", priceValue: 149, time: "20 min", category: "Hair Wash" },
  { id: "hw-3-premium", name: "Female: Regular Shampoo Wash (Premium)", price: "₹249", priceValue: 249, time: "20 min", category: "Hair Wash" },
  { id: "hw-4-basic", name: "Female: Spl Shampoo + Blow Dry (Basic)", price: "₹349", priceValue: 349, time: "45 min", category: "Hair Wash" },
  { id: "hw-4-premium", name: "Female: Spl Shampoo + Blow Dry (Premium)", price: "₹499", priceValue: 499, time: "45 min", category: "Hair Wash" },

  // HAIR COLOUR
  { id: "hcol-1-basic", name: "Male: Hair Colour (Basic)", price: "₹349", priceValue: 349, time: "45 min", category: "Hair Colouring" },
  { id: "hcol-1-advance", name: "Male: Hair Colour (Advance)", price: "₹499", priceValue: 499, time: "45 min", category: "Hair Colouring" },
  { id: "hcol-1-premium", name: "Male: Hair Colour (Premium)", price: "₹699", priceValue: 699, time: "45 min", category: "Hair Colouring" },
  { id: "hcol-1-ultra", name: "Male: Hair Colour (Ultra)", price: "₹899", priceValue: 899, time: "45 min", category: "Hair Colouring" },
  { id: "hcol-2-basic", name: "Female: Basic Colour (Tier 1)", price: "₹1999", priceValue: 1999, time: "90 min", category: "Hair Colouring" },
  { id: "hcol-2-standard", name: "Female: Basic Colour (Tier 2)", price: "₹2999", priceValue: 2999, time: "90 min", category: "Hair Colouring" },
  { id: "hcol-2-advance", name: "Female: Basic Colour (Tier 3)", price: "₹3999", priceValue: 3999, time: "90 min", category: "Hair Colouring" },
  { id: "hcol-2-premium", name: "Female: Basic Colour (Tier 4)", price: "₹4999", priceValue: 4999, time: "90 min", category: "Hair Colouring" },
  { id: "hcol-3-basic", name: "Female: Advanced Colour (Basic)", price: "₹5999", priceValue: 5999, time: "120 min", category: "Hair Colouring" },
  { id: "hcol-3-advance", name: "Female: Advanced Colour (Advance)", price: "₹6999", priceValue: 6999, time: "120 min", category: "Hair Colouring" },
  { id: "hcol-3-premium", name: "Female: Advanced Colour (Premium)", price: "₹7999", priceValue: 7999, time: "120 min", category: "Hair Colouring" },
  { id: "hcol-4", name: "Female: Baliyaaz", price: "₹6999", priceValue: 6999, time: "180 min", category: "Hair Colouring" },
  { id: "hcol-5-basic", name: "Female: Global Colour (Basic)", price: "₹5999", priceValue: 5999, time: "150 min", category: "Hair Colouring" },
  { id: "hcol-5-advance", name: "Female: Global Colour (Advance)", price: "₹6999", priceValue: 6999, time: "150 min", category: "Hair Colouring" },
  { id: "hcol-5-premium", name: "Female: Global Colour (Premium)", price: "₹7999", priceValue: 7999, time: "150 min", category: "Hair Colouring" },
  { id: "hcol-6", name: "Female: Root Touch-Up", price: "₹1499", priceValue: 1499, time: "60 min", category: "Hair Colouring" },

  // HAIR SPA
  { id: "hspa-1-basic", name: "Male: Hair Spa (Basic)", price: "₹999", priceValue: 999, time: "45 min", category: "Hair Spa" },
  { id: "hspa-1-standard", name: "Male: Hair Spa (Standard)", price: "₹1199", priceValue: 1199, time: "45 min", category: "Hair Spa" },
  { id: "hspa-1-advance", name: "Male: Hair Spa (Advance)", price: "₹1599", priceValue: 1599, time: "45 min", category: "Hair Spa" },
  { id: "hspa-1-premium", name: "Male: Hair Spa (Premium)", price: "₹1999", priceValue: 1999, time: "45 min", category: "Hair Spa" },
  { id: "hspa-2-basic", name: "Female: Hair Spa (Basic)", price: "₹1999", priceValue: 1999, time: "60 min", category: "Hair Spa" },
  { id: "hspa-2-advance", name: "Female: Hair Spa (Advance)", price: "₹2999", priceValue: 2999, time: "60 min", category: "Hair Spa" },
  { id: "hspa-2-premium", name: "Female: Hair Spa (Premium)", price: "₹3499", priceValue: 3499, time: "60 min", category: "Hair Spa" },

  // HAIR TREATMENTS
  { id: "ht-1-basic", name: "Female: Nanoplastia (Tier 1)", price: "₹7999", priceValue: 7999, time: "180 min", category: "Hair Treatment" },
  { id: "ht-1-advance", name: "Female: Nanoplastia (Tier 2)", price: "₹9999", priceValue: 9999, time: "180 min", category: "Hair Treatment" },
  { id: "ht-1-premium", name: "Female: Nanoplastia (Tier 3)", price: "₹11999", priceValue: 11999, time: "180 min", category: "Hair Treatment" },
  { id: "ht-2-basic", name: "Female: Smoothening (Basic)", price: "₹6999", priceValue: 6999, time: "180 min", category: "Hair Treatment" },
  { id: "ht-2-advance", name: "Female: Smoothening (Advance)", price: "₹8999", priceValue: 8999, time: "180 min", category: "Hair Treatment" },
  { id: "ht-2-premium", name: "Female: Smoothening (Premium)", price: "₹10999", priceValue: 10999, time: "180 min", category: "Hair Treatment" },
  { id: "ht-3-basic", name: "Female: Botox (Basic)", price: "₹6999", priceValue: 6999, time: "180 min", category: "Hair Treatment" },
  { id: "ht-3-advance", name: "Female: Botox (Advance)", price: "₹8999", priceValue: 8999, time: "180 min", category: "Hair Treatment" },
  { id: "ht-3-premium", name: "Female: Botox (Premium)", price: "₹10999", priceValue: 10999, time: "180 min", category: "Hair Treatment" },
  { id: "ht-4", name: "Female: Keratin", price: "₹6999", priceValue: 6999, time: "150 min", category: "Hair Treatment" },
  { id: "ht-5", name: "Male: Nanoplastia", price: "₹3999", priceValue: 3999, time: "120 min", category: "Hair Treatment" },
  { id: "ht-6-basic", name: "Male: Smoothening (Basic)", price: "₹1999", priceValue: 1999, time: "120 min", category: "Hair Treatment" },
  { id: "ht-6-advance", name: "Male: Smoothening (Advance)", price: "₹2499", priceValue: 2499, time: "120 min", category: "Hair Treatment" },
  { id: "ht-6-premium", name: "Male: Smoothening (Premium)", price: "₹2999", priceValue: 2999, time: "120 min", category: "Hair Treatment" },
  { id: "ht-7-basic", name: "Male: Botox (Basic)", price: "₹3199", priceValue: 3199, time: "120 min", category: "Hair Treatment" },
  { id: "ht-7-premium", name: "Male: Botox (Premium)", price: "₹4499", priceValue: 4499, time: "120 min", category: "Hair Treatment" },
  { id: "ht-8", name: "Male: Keratin", price: "₹3199", priceValue: 3199, time: "90 min", category: "Hair Treatment" },
  { id: "ht-9", name: "Unisex: Dandruff", price: "₹2999", priceValue: 2999, time: "45 min", category: "Hair Treatment" },
  { id: "ht-10", name: "Unisex: Hair Fall", price: "₹3499", priceValue: 3499, time: "45 min", category: "Hair Treatment" },
  { id: "ht-11", name: "Unisex: Heavy Moisturising", price: "₹4999", priceValue: 4999, time: "60 min", category: "Hair Treatment" },

  // BEARD & SHAVE
  { id: "bs-1", name: "Shave", price: "₹49", priceValue: 49, time: "20 min", category: "Beard & Shave" },
  { id: "bs-2", name: "Beard Set", price: "₹79", priceValue: 79, time: "20 min", category: "Beard & Shave" },

  // NAIL SERVICES
  { id: "ns-1", name: "Nail Art", price: "₹349", priceValue: 349, time: "30 min", category: "Nail Services" },
  { id: "ns-2", name: "Nail Extensions", price: "₹499", priceValue: 499, time: "60 min", category: "Nail Services" },
  { id: "ns-3", name: "Gel Overlay", price: "₹499", priceValue: 499, time: "45 min", category: "Nail Services" },
  { id: "ns-4", name: "Gel Overlay Removal", price: "₹499", priceValue: 499, time: "20 min", category: "Nail Services" },
  { id: "ns-5", name: "Acrylic Removal", price: "₹499", priceValue: 499, time: "30 min", category: "Nail Services" },
  { id: "ns-6", name: "Gel Polish (Feet)", price: "₹999", priceValue: 999, time: "40 min", category: "Nail Services" },
  { id: "ns-7", name: "Gel Polish (Hands)", price: "₹99", priceValue: 99, time: "30 min", category: "Nail Services" },
  { id: "ns-8", name: "Gel Polish Removal", price: "₹499", priceValue: 499, time: "20 min", category: "Nail Services" },

  // MANICURE & PEDICURE
  { id: "mp-1-basic", name: "Manicure (Basic)", price: "₹599", priceValue: 599, time: "45 min", category: "Mani & Pedi" },
  { id: "mp-1-advance", name: "Manicure (Advance)", price: "₹799", priceValue: 799, time: "45 min", category: "Mani & Pedi" },
  { id: "mp-1-premium", name: "Manicure (Premium)", price: "₹999", priceValue: 999, time: "45 min", category: "Mani & Pedi" },
  { id: "mp-2-basic", name: "Pedicure (Basic)", price: "₹599", priceValue: 599, time: "60 min", category: "Mani & Pedi" },
  { id: "mp-2-advance", name: "Pedicure (Advance)", price: "₹799", priceValue: 799, time: "60 min", category: "Mani & Pedi" },
  { id: "mp-2-premium", name: "Pedicure (Premium)", price: "₹999", priceValue: 999, time: "60 min", category: "Mani & Pedi" },

  // MASSAGE
  { id: "mg-1", name: "Body Massage (10 min)", price: "₹149", priceValue: 149, time: "10 min", category: "Massages" },
  { id: "mg-2", name: "Body Massage (20 min)", price: "₹249", priceValue: 249, time: "20 min", category: "Massages" },
  { id: "mg-3", name: "Body Massage (30 min)", price: "₹349", priceValue: 349, time: "30 min", category: "Massages" },
  { id: "mg-4", name: "Body Massage (1 hour)", price: "₹699", priceValue: 699, time: "60 min", category: "Massages" },

  // MAKEUP
  { id: "mu-1-basic", name: "Party Makeup (Basic)", price: "₹4999", priceValue: 4999, time: "90 min", category: "Makeup" },
  { id: "mu-1-advance", name: "Party Makeup (Advance)", price: "₹5999", priceValue: 5999, time: "90 min", category: "Makeup" },
  { id: "mu-1-premium", name: "Party Makeup (Premium)", price: "₹6999", priceValue: 6999, time: "90 min", category: "Makeup" },
  { id: "mu-2-basic", name: "Engagement Makeup (Basic)", price: "₹6999", priceValue: 6999, time: "120 min", category: "Makeup" },
  { id: "mu-2-advance", name: "Engagement Makeup (Advance)", price: "₹7999", priceValue: 7999, time: "120 min", category: "Makeup" },
  { id: "mu-2-premium", name: "Engagement Makeup (Premium)", price: "₹8999", priceValue: 8999, time: "120 min", category: "Makeup" },
  { id: "mu-3-basic", name: "Wedding Makeup (Basic)", price: "₹14999", priceValue: 14999, time: "180 min", category: "Makeup" },
  { id: "mu-3-advance", name: "Wedding Makeup (Advance)", price: "₹19999", priceValue: 19999, time: "180 min", category: "Makeup" },
  { id: "mu-3-premium", name: "Wedding Makeup (Premium)", price: "₹24999", priceValue: 24999, time: "180 min", category: "Makeup" },
  { id: "mu-3-ultra", name: "Wedding Makeup (Ultra)", price: "₹29999", priceValue: 29999, time: "180 min", category: "Makeup" },

  // SCALP & SKIN
  { id: "ss-1", name: "Scalp Treatment (Male)", price: "₹1599", priceValue: 1599, time: "45 min", category: "Scalp & Skin" },
  { id: "ss-2", name: "Scalp Treatment (Female)", price: "₹2499", priceValue: 2499, time: "60 min", category: "Scalp & Skin" },
  { id: "ss-3", name: "Skin & Body Treatment", price: "₹4999", priceValue: 4999, time: "120 min", category: "Scalp & Skin" },

  // COMBO PACKAGES
  { 
    id: "cb-1", 
    name: "Combo 1 – Basic Grooming", 
    description: "Haircut + Hair Wash + Head Massage + Beard Set",
    price: "₹200", 
    priceValue: 200, 
    time: "60 min", 
    category: "Combos" 
  },
  { 
    id: "cb-2", 
    name: "Combo 2 – Grooming + De-Tan", 
    description: "Haircut + Hair Wash + Head Massage + Beard Set + De-Tan",
    price: "₹650", 
    priceValue: 650, 
    time: "90 min", 
    category: "Combos" 
  },
  { 
    id: "cb-3", 
    name: "Combo 3 – Grooming + Clean-Up", 
    description: "Haircut + Hair Wash + Head Massage + Beard Set + Clean-Up",
    price: "₹800", 
    priceValue: 800, 
    time: "90 min", 
    category: "Combos" 
  },
  { 
    id: "cb-4", 
    name: "Combo 4 – Grooming + Hair Colour", 
    description: "Haircut + Hair Wash + Head Massage + Beard Set + Hair Colour",
    price: "₹1000", 
    priceValue: 1000, 
    time: "100 min", 
    category: "Combos" 
  },
  { 
    id: "cb-5", 
    name: "Combo 5 – Grooming + Spa + Clean-Up", 
    description: "Haircut + Hair Wash + Head Massage + Beard Set + Hair Spa + Clean-Up",
    price: "₹1200", 
    priceValue: 1200, 
    time: "120 min", 
    category: "Combos" 
  },
  { 
    id: "cb-6", 
    name: "Combo 6 – Premium Grooming", 
    description: "Haircut + Hair Wash + Head Massage + Beard Set + Facial + De-Tan",
    price: "₹1600", 
    priceValue: 1600, 
    time: "150 min", 
    category: "Combos" 
  },
];
