// Prompt Library (17_PROMPT_LIBRARY.md) -- in-code mirror of the TPL_VID_* templates.
// Claude Rule #2 of that doc forbids inlining prompts in Engine code, so engines must
// call get() here rather than writing their own strings. Templates are copied verbatim
// from 17_PROMPT_LIBRARY.md sections 7; Rule #1 (immutable history) applies -- to change
// one, add a _v2 entry, never edit these in place.

const TEMPLATES = {
  TPL_VID_001_v1: {
    engine: "Video Engine",
    operation: "IMAGE_TO_VIDEO",
    camera: "DRONE_REVEAL",
    static: true,
    text: `Slow cinematic drone rising reveal shot.
Camera starts very low near ground level, slowly ascends vertically
while simultaneously tilting upward to reveal the full property and its surroundings.
Ultra smooth motion, absolutely no camera shake.
Warm golden hour natural lighting throughout the shot.
Cinematic wide angle, photorealistic, continuous fluid motion.
No text, no overlays, no watermark, no subtitles.`,
  },
  TPL_VID_002_v1: {
    engine: "Video Engine",
    operation: "IMAGE_TO_VIDEO",
    camera: "PAN_RIGHT",
    static: true,
    text: `Ultra smooth slow cinematic pan from left to right across the property facade.
Steady horizontal camera movement at consistent controlled speed.
Natural parallax depth effect creates dimensional feeling on foreground elements.
Wide establishing shot framing, slight shallow depth of field on distant background.
No camera shake, perfectly smooth motion throughout entire duration.
Photorealistic quality, no text, no watermark, no overlays.`,
  },
  TPL_VID_003_v1: {
    engine: "Video Engine",
    operation: "IMAGE_TO_VIDEO",
    camera: "ZOOM_IN",
    static: true,
    text: `Slow cinematic push-in dolly zoom toward the main entrance of the property.
Camera moves smoothly forward as if approaching the front door on a dolly track.
Gentle shallow depth of field with soft bokeh on foreground foliage.
Inviting warm lighting draws the eye toward the entrance focal point.
Smooth continuous forward motion, no shake, no jump cuts.
Photorealistic, no text, no logos, no overlays, no watermark.`,
  },
  TPL_VID_004_v1: {
    engine: "Video Engine",
    operation: "IMAGE_TO_VIDEO",
    camera: "TILT_UP",
    static: true,
    text: `Cinematic tilt-up camera movement starting from the base of the building.
Camera begins at ground level pointed slightly downward, then tilts smoothly upward
to reveal the full height of the structure against the open sky.
Dramatic upward perspective emphasizing architectural scale and height.
Smooth controlled tilt motion, no shake, consistent speed throughout.
Photorealistic architectural photography motion, no text, no overlays, no watermark.`,
  },
  // TPL_VID_005_v1 (ORBIT) exists in 17_PROMPT_LIBRARY.md but "ORBIT" is NOT in the
  // camera_motion enum of schemas/video.schema.json (which allows only PAN_RIGHT,
  // ZOOM_IN, DRONE_REVEAL, TILT_UP). Kept here for completeness but unreachable via
  // the current contract -- flagged as a spec inconsistency in 20_ROADMAP.md.
  TPL_VID_005_v1: {
    engine: "Video Engine",
    operation: "IMAGE_TO_VIDEO",
    camera: "ORBIT",
    static: true,
    text: `Smooth cinematic orbital camera movement arcing around the property.
Camera maintains constant distance from subject while rotating from
front-left position through front to front-right position.
Wide angle lens, maintaining mid-height camera elevation throughout.
Continuous smooth arc motion, no shake, no interruption.
Golden hour warm lighting, lush surrounding landscaping in frame.
Photorealistic quality, no text, no watermark, no logos.`,
  },
  TPL_VID_006_v1: {
    engine: "Video Engine",
    operation: "IMAGE_TO_VIDEO",
    camera: "DRONE_REVEAL",
    useCase: "Satellite map (Google Static Maps) fly-in",
    static: true,
    text: `Cinematic satellite map aerial zoom-in animation.
Camera starts from high altitude overview of the area,
smoothly descends and zooms in toward a specific location in the center.
Natural smooth aerial descent motion, no sudden jumps.
The landscape becomes progressively more detailed as camera descends.
Realistic aerial photography movement, continuous fluid motion.
No text, no pins, no overlays, no watermark, no map labels.`,
  },
};

// ---------------------------------------------------------------------------
// House Engine templates (17_PROMPT_LIBRARY.md §6), copied verbatim.
// ---------------------------------------------------------------------------
const HOUSE_TEMPLATES = {
  TPL_HOUSE_001_v1: {
    engine: "House Engine",
    operation: "IMAGE_GENERATION",
    static: false,
    text: `Photorealistic exterior photograph of a {{style_description}} house.
{{additional_features}}.
Architectural photography style, sharp focus, natural {{lighting_condition}} lighting,
beautiful landscaping, professional real estate photography.
Ultra detailed, 8K resolution, cinematic composition.
No people, no cars, no text, no watermark, no logo, no signage, no numbers.`,
    defaults: {
      style_description: "2-story modern contemporary single family",
      additional_features: "surrounded by mature trees, well-maintained garden",
      lighting_condition: "golden hour",
    },
  },
};

// ---------------------------------------------------------------------------
// Templates for the "cosmic descent -> house rises" storyboard, added 2026-07-29.
// Registered in 17_PROMPT_LIBRARY.md §7.1 and the §13 registry table on 2026-08-09.
// Version suffix stays _v1 because they are new IDs, not edits of existing ones.
// ---------------------------------------------------------------------------
const STORYBOARD_TEMPLATES = {
  TPL_VID_007_v1: {
    engine: "Video Engine",
    operation: "IMAGE_TO_VIDEO",
    camera: "DRONE_REVEAL",
    useCase: "Shot 1 -- orbital descent from space down to the plot",
    static: true,
    text: `Cinematic descent from outer space down to Earth.
Camera begins in orbit with the curvature of the planet and blackness of space visible,
then plunges continuously downward through thin cloud layers,
the terrain below growing steadily larger and sharper,
finally settling into a low aerial view centred on the property.
One single unbroken accelerating-then-easing move, no cuts, no shake.
Photorealistic satellite-to-drone footage, natural daylight.
No text, no map labels, no pins, no overlays, no watermark.`,
  },
  TPL_VID_009_v1: {
    engine: "Video Engine",
    operation: "IMAGE_TO_VIDEO",
    camera: "ZOOM_IN",
    useCase: "Shot 1 -- opens on the pinned map, camera pushes toward the marker",
    static: true,
    text: `Slow cinematic push toward the marker at the centre of the map.
The map stays flat and legible while the camera closes in steadily,
streets and blocks growing larger around the pin as it approaches.
Very smooth continuous forward motion, no shake, no rotation, no cuts.
Clean digital cartography look, crisp edges, even lighting.
Do not add, move or duplicate any marker, label or icon.`,
  },
  // Replaces _v1's flat map-push with a full space-to-ground dive -- user's exact prompt,
  // 2026-08-20. Rule #1 (immutable history): _v1 stays as-is, this is a new id, not an edit.
  TPL_VID_009_v2: {
    engine: "Video Engine",
    operation: "IMAGE_TO_VIDEO",
    camera: "ZOOM_IN",
    useCase: "Shot 1 -- opens in orbit, dives down through the atmosphere onto the pinned map",
    static: true,
    text: `A cinematic continuous fast zoom-in shot starting from deep space showing planet Earth,
rapidly diving through the atmosphere, passing clouds, zooming down into the property's
district as shown on the map, narrowing in on the exact land parcel from the input photo,
and finally dropping a digital Google Maps red location pin on the exact spot.
4k resolution, smooth camera movement, photorealistic.
No text, no extra markers, no watermark.`,
  },
  // WF8b §3 -- the preservation-first listing shot. Every other video template in this
  // file asks the model to CREATE something; this one exists to stop it creating anything.
  // The negative list is long and specific on purpose: WF8b's whole premise is that a
  // generated house, road or mountain that is not on the real plot is a false claim about
  // property being sold, not a stylistic choice.
  TPL_VID_011_v1: {
    engine: "Video Engine",
    operation: "IMAGE_TO_VIDEO",
    camera: "ZOOM_IN",
    useCase: "WF8b -- one verified listing photo becomes a 4-6s clip that adds nothing",
    static: false,
    text: `Create a realistic cinematic real-estate video from this exact reference image.

Preserve the land, terrain, road, trees, buildings, boundaries, weather, and all visible details exactly as shown. Do not add, remove, repair, or change any land feature. Do not add houses, people, vehicles, roads, water, mountains, utility poles, signs, or objects that are absent from the original image.

Camera movement: {{camera_motion}}. Add only subtle natural movement to existing grass, leaves, and clouds where visible. Use realistic Thai daylight, stable professional real-estate footage, and truthful natural colours.

No text, captions, logo, watermark, fantasy effect, time lapse, scene transition, aerial view, or invented details.`,
    defaults: {
      camera_motion: "stable cinematic hold with subtle natural environmental movement",
    },
  },
  // ---- 3-WF (wf/WF1.md, wf/WF2.md) ----
  // Active voice throughout: both Flow and Veo take direction from a stated motion vector,
  // not from a description of a scene. These are the single source for that wording -- the
  // console, the CLI and the auto runner all read them from here, because keeping a second
  // copy next to the console is what let the page drift onto a different prompt before.
  TPL_WF1_v1: {
    engine: "Video Engine",
    operation: "IMAGE_TO_VIDEO",
    camera: "DRONE_REVEAL",
    useCase: "WF1 -- a round trip: starts ON the seller's real land photo, pulls out to a satellite view, dives back through cloud, and lands on the exact same photo",
    static: true,
    // Second rewrite -- the first version (satellite -> zoom -> cloud -> land) still put a
    // SEPARATELY GENERATED satellite plate as the start anchor, which is not what the
    // reference clip the spec owner tested in Google Flow actually does. The real shot runs
    // the other direction: it starts ON the input photo, pulls OUT to reveal the satellite
    // view, dives back down through cloud, and returns to that exact same photo -- a round
    // trip, not a one-way descent. That is why runWfAuto (src/wf/prepare.mjs) now feeds the
    // SAME land photo as both the start and end anchor for this clip instead of a generated
    // satellite plate: the loop is enforced structurally by Veo's first-last-frame endpoint,
    // not left to the prompt alone. Wording is the spec owner's own, confirmed against a
    // real clip -- kept verbatim rather than paraphrased.
    text: `A single continuous cinematic aerial journey that begins from the provided input image
of the property.

The video MUST begin on the exact provided input image. Hold the original image naturally
for a brief moment before the camera begins to move.

The camera then smoothly pulls backward and rises away from the property, gradually
revealing more of the surrounding landscape. The movement accelerates naturally as the
camera climbs higher and higher, transitioning from the original ground-level view into
a wide aerial view of the surrounding countryside.

Continue rising and pulling back until the property becomes a small part of the larger
landscape. The camera reaches a high aerial / satellite-like perspective showing the
surrounding fields, roads, trees and terrain.

A simple location pin appears naturally over the property location during the high
aerial view.

The camera then begins a fast, smooth push-in toward the exact same property location.

The descent accelerates continuously toward the marked location, moving through the
aerial landscape and gradually transitioning back toward the property.

As the camera descends, it passes naturally through realistic soft white clouds and thin
atmospheric haze.

The ground gradually becomes clearer beneath the clouds.

The camera continues descending and smoothly transitions from the high aerial perspective
back into the original ground-level viewpoint.

The final approach must return to the EXACT SAME VIEWPOINT, FRAMING, CAMERA HEIGHT,
ORIENTATION AND COMPOSITION as the provided input image.

The final frame must match the original input image as closely as possible.

The beginning and ending frames should feel like the same physical camera position,
creating a seamless visual loop.

The camera movement must remain continuous throughout the entire shot.

No cuts.
No hard transitions.
No teleportation.
No camera reset.
No sudden change of location.
No sudden change of perspective.
No abrupt stop.

The entire sequence should feel like one continuous drone flight:
starting from the property,
pulling away into the sky,
revealing the surrounding landscape,
reaching a satellite-like aerial view,
marking the location,
then diving back through the clouds
and returning precisely to the original property view.

Photorealistic cinematic drone footage.
Natural daylight.
Realistic aerial perspective.
Realistic terrain.
Realistic atmospheric haze.
Realistic volumetric clouds.
Natural motion blur.
Smooth physically believable acceleration and deceleration.

The original property, surrounding landscape and existing structures must remain visually
consistent when the camera returns to the property.

No text.
No map labels.
No additional UI.
No decorative overlays.
No watermark.`,
  },
  TPL_WF2_v1: {
    engine: "Video Engine",
    operation: "IMAGE_TO_VIDEO",
    camera: "DRONE_REVEAL",
    useCase: "WF2 -- construction time-lapse on the seller's own plot, ending at warm evening",
    static: true,
    // Every ABSOLUTE RULE in wf/WF2.md is stated here explicitly, including the negatives:
    // the model reliably drifts toward a resort or a two-storey build without them.
    //
    // Opening line is the spec owner's own wording, matched to WF1's rewrite above: WF1 no
    // longer "eases to a stop" like a drone landing -- it settles back into the exact input
    // photo it started on (a loop), so WF2 has to pick up from THAT settling motion, not
    // from an arrival that no longer happens.
    text: `The video begins from the exact final frame of WF1, which is the original input image.
The camera continues naturally from the final settling motion of WF1 before construction
begins. A construction time-lapse then begins on this exact plot of land. The camera holds
the same viewpoint throughout -- it never cuts, never jumps, never restarts from a
different angle. The land itself never changes -- the terrain, the road, the tree line, the
mountains and the shape of the plot stay exactly as they are. Only the house is built.

Workers clear and level the ground, then footings and a concrete foundation are poured.
The single-storey frame rises post by post, the sloped roof structure goes on and is
covered, walls are built and rendered in warm earth tones, wooden doors and windows are
fitted, the covered front porch takes shape, and a matching roofed carport is built beside
the house. Natural wood accents are added, then the garden fills in around it -- lawn is
laid, mature trees and shrubs are planted, a stone footpath is set, potted plants and a
seating corner appear.

The light moves through the day as the house rises: late afternoon warms into golden hour,
golden hour cools into blue hour, and blue hour settles into early evening. The change is
gradual and continuous, never jumping from day to night.

As evening arrives, warm white and warm amber lights switch on one part of the house at a
time -- windows, front door, porch, living room, kitchen, carport -- glowing softly onto the
garden. Soft path lights come on along the walkway. The sky deepens to a rich blue evening
sky while the mountains, trees and road stay visible behind the house.

The camera pushes in very slowly with a gentle parallax, then eases back at the end to
reveal the finished house, the garden, the carport and the natural landscape behind them.

One continuous time-lapse. The house is built step by step and never appears instantly.
Photorealistic, cozy, homely, warm and natural. No text, no watermark, no overlays.`,
  },
  // TPL_WF2_v2 -- same proven skeleton as v1 (continuity rule, time-lapse structure,
  // negative list all unchanged), except the house description is a placeholder instead of
  // one hardcoded style. v1 gave every property the identical cozy single-storey garden
  // house regardless of its real style_tag -- a LUXURY_CLASSIC mansion listing and a
  // MINIMALIST condo both got the same build. src/lib/director.mjs fills
  // {{style_directive}} with a paragraph derived from the property's actual style_tag and
  // features; `defaults.style_directive` below is v1's own wording, reworded to fit this
  // slot, so a caller that never runs the Director (or Director degrades) gets output
  // equivalent to v1, not a broken prompt.
  TPL_WF2_v2: {
    engine: "Video Engine",
    operation: "IMAGE_TO_VIDEO",
    camera: "DRONE_REVEAL",
    useCase: "WF2 -- construction time-lapse, house style driven by the listing's style_tag",
    static: false,
    text: `The video begins from the exact final frame of WF1, which is the original input image.
The camera continues naturally from the final settling motion of WF1 before construction
begins. A construction time-lapse then begins on this exact plot of land. The camera holds
the same viewpoint throughout -- it never cuts, never jumps, never restarts from a
different angle. The land itself never changes -- the terrain, the road, the tree line, the
mountains and the shape of the plot stay exactly as they are. Only the house is built.

Workers clear and level the ground, then footings and a concrete foundation are poured.
{{style_directive}} A matching carport is built beside the house in the same material
language, then the garden fills in around it -- lawn is laid, mature trees and shrubs are
planted, a stone footpath is set, potted plants and a seating corner appear.

The light moves through the day as the house rises: late afternoon warms into golden hour,
golden hour cools into blue hour, and blue hour settles into early evening. The change is
gradual and continuous, never jumping from day to night.

As evening arrives, warm lights switch on one part of the house at a time -- windows, front
door, porch, living room, kitchen, carport -- glowing softly onto the garden. Soft path
lights come on along the walkway. The sky deepens to a rich blue evening sky while the
mountains, trees and road stay visible behind the house.

The camera pushes in very slowly with a gentle parallax, then eases back at the end to
reveal the finished house, the garden, the carport and the natural landscape behind them.

One continuous time-lapse. The house is built step by step and never appears instantly.
Photorealistic, warm and natural, matching the described style exactly.
No text, no watermark, no overlays.`,
    defaults: {
      style_directive:
        "The single-storey frame rises post by post, the sloped roof structure goes on and " +
        "is covered, walls are built and rendered in warm earth tones, wooden doors and " +
        "windows are fitted, the covered front porch takes shape, and natural wood accents " +
        "are added throughout.",
    },
  },
  TPL_VID_010_v1: {
    engine: "Video Engine",
    operation: "IMAGE_TO_VIDEO",
    camera: "DRONE_REVEAL",
    useCase: "WF1 -- aerial descent from high above, down through the sky, onto the real plot",
    // History, so nobody re-breaks this: two rewrites chasing EXTRA BEATS (an FPV dive, a
    // pin-drop narrative) each made the shot worse -- the model starts inventing motion when
    // handed a multi-beat story. Do not add beats.
    //
    // But the original wording had its own bug, found by reading it back translated: it said
    // "from a flat overhead perspective" and "one unbroken FALLING move", which instructed a
    // flat top-down drift straight down -- the exact "sliding across a map" look that kept
    // getting rejected. WF-REALESTATE-3WF-SPEC.md SCENE 2 asks for the opposite: perspective
    // INCREASING with speed, and the camera FLYING down, not falling. Those two lines now say
    // that. Describing the camera's attitude is not the same as adding a beat.
    //
    // Separately, and still true: the start frame MUST be clean satellite photography
    // (maptype=satellite, no markers). Feeding a labelled map in -- roadmap/hybrid, POI
    // icons, a red pin -- makes the model read the pin and POI glyphs as physical objects
    // and animate them as balloons drifting through the sky, and no amount of "no pins, no
    // text" here removes what is baked into the input image. The WF1 location marker is
    // composited afterwards by compositeWf1Pin() instead.
    text: `Continuous aerial descent from high above the ground down to the site.
Camera drops steadily through open sky, down through a layer of real white clouds and
thin haze, the ground gradually appearing below as it emerges under the cloud base,
the camera tilting forward as it descends so the perspective deepens from a high
looking-down angle into a low forward-facing view, arriving at a real photographic
ground-level view of the same location.
One unbroken accelerating flight that eases to a stop, no cuts, no shake.
Photorealistic drone footage, natural daylight, realistic volumetric clouds,
natural motion blur.
No text, no map labels, no pins, no overlays, no watermark.`,
  },
  TPL_VID_008_v1: {
    engine: "Video Engine",
    operation: "IMAGE_TO_VIDEO",
    camera: "DRONE_REVEAL",
    useCase: "Shot 2 -- empty plot to finished house (needs a start AND end frame)",
    static: true,
    text: `Time-lapse construction on an empty plot of land.
The bare ground gives way as a house rises into place piece by piece,
foundation then frame then walls then roof, settling into a finished home.
Camera holds a slow steady aerial push forward throughout.
Smooth continuous transformation, no cuts, no flicker, no shake.
Photorealistic architectural time-lapse, warm natural daylight.
No text, no watermark, no people, no vehicles, no signage.`,
  },
};

// Caption templates for Publish Engine, copied verbatim from 17_PROMPT_LIBRARY.md
// section 8. Unlike the media templates above, these MAY carry price and contact
// details -- captions are text on the platform, not prompts sent to an image/video
// provider, so hard rule #1 (no price/phone in generative prompts) does not apply.
const CAPTION_TEMPLATES = {
  TPL_CAP_001_v1: {
    engine: "Publish Engine",
    operation: "TEXT_COMPLETION",
    platform: "TIKTOK",
    text: `You are a Thai social media copywriter specializing in real estate content for TikTok.

Write a TikTok caption for this property listing. Follow all rules strictly.

Caption Rules:
- Language: Thai only
- Total length: 150 to 300 characters (including hashtags)
- Start with an attention hook using emoji
- Tone: Conversational, exciting, natural — NOT a formal advertisement
- Mention: location + one strongest selling point
- End with a clear call-to-action
- Hashtags: 6to 8 hashtags at the very end

Property Details:
Title: {{title}}
Price: {{price_formatted}}
Location: {{location}}
Key Features: {{highlight_features}}

Return ONLY the caption text with hashtags. No explanation. No JSON. No markdown.`,
  },
  TPL_CAP_002_v1: {
    engine: "Publish Engine",
    operation: "TEXT_COMPLETION",
    platform: "YOUTUBE_SHORTS",
    text: `You are a Thai real estate YouTube Shorts content creator.

Write a YouTube Shorts description for this property.

Rules:
- Language: Thai
- Maximum100 characters total (very short — Shorts best practice)
- Include location and price
- End with a question or CTA to encourage comments
- Hashtags: 3 maximum, inside the 100 character limit if possible

Property:
Title: {{title}}
Price: {{price_formatted}}
Location: {{location}}

Return only the description text. No explanation.`,
  },
  TPL_CAP_003_v1: {
    engine: "Publish Engine",
    operation: "TEXT_COMPLETION",
    platform: "FACEBOOK_REELS",
    text: `You are a Thai real estate Facebook content creator.

Write a Facebook Reels caption for this property listing.

Rules:
- Language: Thai
- Length: 200 to 400 characters
- Tone: Slightly more formal than TikTok but still engaging
- Must include: property title, location, price, 2-3 key features
- Must include: a clear call-to-action with contact instruction
- Hashtags: 5 to 7 relevant hashtags at the end
- Do NOT use emojis excessively — maximum 3 emojis total

Property:
Title: {{title}}
Price: {{price_formatted}}
Location: {{location}}
Key Features: {{highlight_features}}
Contact: {{contact_method}}

Return only the caption. No explanation.`,
  },
  TPL_CAP_004_v1: {
    engine: "Publish Engine",
    operation: "TEXT_COMPLETION",
    platform: "INSTAGRAM_REELS",
    text: `You are a bilingual Thai-English real estate Instagram content creator.

Write an Instagram Reels caption for this property.

Rules:
- Mix Thai and English naturally (Thai main body, English keywords and hashtags)
- Length: 150 to 250 characters
- Aesthetic tone: aspirational, premium, lifestyle-focused
- Mention location and one luxury feature
- Hashtags: 10 to 15 hashtags mixing Thai and English real estate tags
- Use line breaks to separate the main text and hashtags section

Property:
Title: {{title}}
Price: {{price_formatted}}
Location: {{location}}
Style: {{style_tag}}
Key Features: {{highlight_features}}

Return only the caption with hashtags. No explanation.`,
  },
};

// Listing extraction from an already-published Facebook post. Distinct from
// TPL_PROP_001_v1 (which cleans a broker's raw ad into PROPERTY_OUT and strips contact
// details): here the post is the page's own, and the Google Maps link is the single most
// valuable field to recover, because everything downstream -- coordinates, nearby places,
// the map pin in the group caption -- hangs off it.
// TODO: register TPL_PROP_010_v1 in 17_PROMPT_LIBRARY.md + the registry table.
const LISTING_TEMPLATES = {
  TPL_PROP_010_v1: {
    engine: "Listing Importer",
    operation: "TEXT_COMPLETION",
    text: `You are extracting Thai land-for-sale listing data from a Facebook post the seller wrote themselves.

Return ONLY a JSON object. No markdown fence, no explanation.

{
  "is_listing": boolean,        // true for any specific property for sale -- land, house, or resort/business. false only for non-sales posts (news, events, greetings, general promotion of the page)
  "title": string,              // short Thai label, max 60 chars, e.g. "ที่ดิน 2 ไร่ องครักษ์"
  "price_thb": number|null,     // total price as a plain number. "2.5 ล้าน" -> 2500000. null if absent or per-wa only
  "price_text": string|null,    // price exactly as written, e.g. "ไร่ละ 1.2 ล้าน"
  "size_text": string|null,     // area as written, e.g. "2 ไร่ 1 งาน" or "100 ตร.ว."
  "size_rai": number|null,      // area converted to rai. 1 ไร่ = 4 งาน = 400 ตร.ว.
  "location": string|null,      // district/province only, e.g. "องครักษ์ นครนายก"
  "maps_url": string|null,      // any google maps link found, verbatim
  "coordinates": string|null,   // "lat,lng" if bare coordinates appear in the text
  "highlights": string[],       // max 3 factual selling points, each under 30 Thai chars
  "contact": string|null        // phone or LINE id as written
}

Rules:
- Copy facts, never invent them. Anything not stated is null or [].
- highlights must be facts (ถมแล้ว, ติดถนนลาดยาง, ไฟฟ้าถึง), never promotional claims
  (ทำเลทอง, ราคาถูกที่สุด, ห้ามพลาด). Drop promotional phrases entirely.
- If the post advertises several plots at once, extract only the first.

Post:
"""
{{post_text}}
"""`,
  },
};

// Facebook *feed* posts (page timeline, and the copy reused for group posts) have no
// template in 17_PROMPT_LIBRARY.md -- section 8 only covers Reels. Added here as a new
// id rather than editing TPL_CAP_003_v1, per the immutable-history rule.
// TODO: register TPL_CAP_005_v1 in 17_PROMPT_LIBRARY.md section 8 + the registry table.
CAPTION_TEMPLATES.TPL_CAP_005_v1 = {
  engine: "Publish Engine",
  operation: "TEXT_COMPLETION",
  platform: "FACEBOOK_PAGE",
  text: `You are a Thai real estate Facebook page content creator.

Write a Facebook feed post caption for this property listing.

Rules:
- Language: Thai
- Length: 300 to 600 characters
- Structure: hook line, blank line, 3-5 bullet lines of facts (prefix each with "• "), blank line, call to action
- Tone: helpful and factual, like a landowner posting themselves — not an agency advertisement
- Must include: location, land size, price, and the contact instruction
- No exaggerated claims (ห้ามใช้คำว่า ดีที่สุด, ถูกที่สุด, รับรอง, การันตี)
- Hashtags: 5 to 8 relevant Thai hashtags on the final line

Property:
Title: {{title}}
Price: {{price_formatted}}
Location: {{location}}
Key Features: {{highlight_features}}
Nearby: {{nearby_summary}}
Contact: {{contact_method}}

Return only the caption. No explanation.`,
  defaults: { nearby_summary: "-" },
};

// Only the four motions present in schemas/video.schema.json are routable.
const CAMERA_TO_TEMPLATE = {
  DRONE_REVEAL: "TPL_VID_001_v1",
  PAN_RIGHT: "TPL_VID_002_v1",
  ZOOM_IN: "TPL_VID_003_v1",
  TILT_UP: "TPL_VID_004_v1",
};

const ALL = {
  ...TEMPLATES,
  ...HOUSE_TEMPLATES,
  ...STORYBOARD_TEMPLATES,
  ...CAPTION_TEMPLATES,
  ...LISTING_TEMPLATES,
};

// Publish Engine looks up by destination rather than by template id.
const PLATFORM_TO_CAPTION_TEMPLATE = {
  TIKTOK: "TPL_CAP_001_v1",
  YOUTUBE_SHORTS: "TPL_CAP_002_v1",
  FACEBOOK_REELS: "TPL_CAP_003_v1",
  INSTAGRAM_REELS: "TPL_CAP_004_v1",
  FACEBOOK_PAGE: "TPL_CAP_005_v1",
  FACEBOOK_GROUP: "TPL_CAP_005_v1",
  LINE_OA: "TPL_CAP_005_v1",
};

export function getCaptionTemplateId(platform) {
  const id = PLATFORM_TO_CAPTION_TEMPLATE[platform];
  if (!id) {
    throw new Error(
      `No caption template for platform "${platform}" -- allowed: ${Object.keys(PLATFORM_TO_CAPTION_TEMPLATE).join(", ")}`
    );
  }
  return id;
}

export function get(templateId) {
  const template = ALL[templateId];
  if (!template) throw new Error(`Unknown template_id: ${templateId}`);
  return template;
}

// Fills {{variables}} from `values`, falling back to the template's documented
// defaults. Any placeholder left unfilled is an error rather than a literal
// "{{foo}}" leaking into a paid generation.
export function fillTemplate(templateId, values = {}) {
  const template = get(templateId);
  const merged = { ...(template.defaults ?? {}), ...values };
  const filled = template.text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (merged[key] === undefined || merged[key] === "") {
      throw new Error(`Template ${templateId} is missing a value for {{${key}}}`);
    }
    return merged[key];
  });
  return filled;
}

export function getByCameraMotion(cameraMotion) {
  const id = CAMERA_TO_TEMPLATE[cameraMotion];
  if (!id) {
    throw new Error(
      `No video template for camera_motion "${cameraMotion}" -- allowed: ${Object.keys(CAMERA_TO_TEMPLATE).join(", ")}`
    );
  }
  return { template_id: id, ...TEMPLATES[id] };
}
