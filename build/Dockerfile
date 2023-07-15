FROM emscripten/emsdk
RUN apt-get update && apt-get install -y ninja-build
RUN pip3 install meson

WORKDIR /
RUN git clone -b v0.29.0 --depth 1 https://github.com/LeelaChessZero/lc0
#RUN git clone -b 3.4 --depth 1 https://gitlab.com/libeigen/eigen

WORKDIR /lc0
COPY build/emccCross.txt .
COPY src/emscripten/* .
ADD build/lc0.patch /tmp
RUN git apply -v /tmp/lc0.patch
#RUN mkdir include && cp -r /eigen/Eigen include
#RUN rm /lc0/subprojects/eigen.wrap
RUN bash -c "./build.sh -Dgtest=false --cross-file=emccCross.txt --default-library=static"
