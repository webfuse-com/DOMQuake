const { createApp, ref, reactive, onMounted, onUnmounted } = Vue;


createApp({
    setup() {
        const data = {
            pages: [
                {
                    id: "home",
                    label: "Lorem"
                },
                {
                    id: "about",
                    label: "Ipsum"
                },
                {
                    id: "contact",
                    label: "Dolor"
                }
            ],
            cards: [
                {
                    title: "Lorem Ipsum",
                    body: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus lacinia odio vitae vestibulum."
                },
                {
                    title: "Dolor Sit",
                    body: "Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas."
                },
                {
                    title: "Amet Consectetur",
                    body: "Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae."
                }
            ],
            team: [
                {
                    initial: "L",
                    name: "Lorem Ipsum",
                    role: "Dolor sit amet",
                    color: "#3498db"
                },
                {
                    initial: "I",
                    name: "Ipsum Dolor",
                    role: "Consectetur adipiscing",
                    color: "#e74c3c"
                },
                {
                    initial: "D",
                    name: "Dolor Amet",
                    role: "Elit sed eiusmod",
                    color: "#2ecc71"
                }
            ],
            slides: [
                {
                    title: "Lorem Ipsum",
                    body: "Lorem ipsum dolor sit amet, consectetur adipiscing elit ut labore.",
                    color: "#3498db"
                },
                {
                    title: "Dolor Sit Amet",
                    body: "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
                    color: "#9b59b6"
                },
                {
                    title: "Consectetur Elit",
                    body: "Ut enim ad minim veniam quis nostrud exercitation ullamco laboris.",
                    color: "#e67e22"
                },
                {
                    title: "Adipiscing Velit",
                    body: "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.",
                    color: "#27ae60"
                },
            ]
        };

        const current = ref("home");

        const slideIndex = ref(0);

        let sliderInterval;

        const refreshSliderInterval = () => {
            clearInterval(sliderInterval);

            sliderInterval = setInterval(nextSlide, 3500);
        };

        refreshSliderInterval();

        onMounted(() => refreshSliderInterval);
        onUnmounted(() => clearInterval(sliderInterval));

        function nextSlide() {
            refreshSliderInterval();

            slideIndex.value = (slideIndex.value + 1) % data.slides.length;
        }

        function prevSlide() {
            refreshSliderInterval();

            slideIndex.value = (slideIndex.value - 1 + data.slides.length) % data.slides.length;
        }

        const form = reactive({
            name: "",
            email: "",
            message: ""
        });

        function handleSubmit() {
            alert("Lorem ipsum!");

            form.name = "";
            form.email = "";
            form.message = "";
        }

        return {
            data,
            current,
            slideIndex,
            form,
            nextSlide,
            prevSlide,
            handleSubmit
        };
    }
})
    .mount("#app");