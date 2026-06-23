import PINS from "../data/pins.json";
import COMPONENTS from "../data/components.json";

export const TangNano9kBoard = {
  id: "tang-nano-9k",
  name: "Tang Nano 9K",
  image: "/images/tang-nano-9k.png",
  width: 1200,
  height: 700,
  pins: PINS,
  components: COMPONENTS,
  pinAssignments: {
    clk: "63",
    btn1: "33",
    btn2: "34",
    "leds[0]": "25",
    "leds[1]": "26",
    "leds[2]": "27",
    "leds[3]": "28",
    "leds[4]": "29",
    "leds[5]": "30",
  }
};
